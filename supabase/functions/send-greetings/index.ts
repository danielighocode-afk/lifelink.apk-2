// send-greetings — sends the daily morning greeting push. Called every 5 minutes by pg_cron (see 018b_schedule_greetings.sql).
// Each call asks the database (greeting_claim_due) which people's random 07:00-10:00 moment has come and who has not had today's
// greeting yet. The database "claims" them in the same step, so overlapping runs can never send the same greeting twice.
// Secrets (Edge Functions -> Secrets): FIREBASE_SERVICE_ACCOUNT and PUSH_WEBHOOK_SECRET (the same two send-push already uses).
// Deploy with JWT verification OFF (supabase/config.toml has verify_jwt = false for it); the x-webhook-secret header protects it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const enc = new TextEncoder();
const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

let cached: { token: string; exp: number } | null = null;
async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claim}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) throw new Error('google token: ' + (out.error_description || out.error || res.status));
  cached = { token: out.access_token, exp: now + Number(out.expires_in || 3600) };
  return out.access_token;
}

type Result = 'ok' | 'dead' | 'fail';
async function sendOne(sa: any, access: string, token: string, title: string, body: string): Promise<Result> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: title.slice(0, 100), body: body.slice(0, 200) },
        data: { type: 'greeting', link: '', title: title.slice(0, 100) },   // no link: tapping just opens the app
        // Greetings use their own channel so a person can mute them without muting booking alerts.
        // ttl: a greeting that cannot be delivered within 3 hours is dropped instead of arriving at lunchtime.
        android: { priority: 'HIGH', ttl: '10800s', notification: { channel_id: 'daily_greeting' } },
      },
    }),
  });
  if (res.ok) return 'ok';
  const err = await res.json().catch(() => ({}));
  const code = err?.error?.details?.find((d: any) => d?.errorCode)?.errorCode ?? err?.error?.status;
  if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || (code === 'INVALID_ARGUMENT' && /registration token/i.test(err?.error?.message ?? ''))) return 'dead';
  console.error('send-greetings fcm', res.status, JSON.stringify(err).slice(0, 300));
  return 'fail';
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!secret || !saRaw) return new Response('not configured', { status: 500 });
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
  let sa: any;
  try { sa = JSON.parse(saRaw); } catch { return new Response('FIREBASE_SERVICE_ACCOUNT is not valid JSON', { status: 500 }); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const started = Date.now();
  let claimed = 0, delivered = 0, rounds = 0;
  const dead: string[] = [];
  try {
    let access = '';
    // Several rounds in one call so a busy morning is cleared quickly; stops when nobody is due (the normal case).
    while (rounds < 20 && Date.now() - started < 40_000) {
      rounds++;
      const { data, error } = await admin.rpc('greeting_claim_due', { p_limit: 200 });
      if (error) { console.error('send-greetings claim', error.message); return json({ error: 'claim failed', claimed, delivered }, 500); }
      const rows: Array<{ user_id: string; day: string; title: string; body: string; tokens: string[] }> = data ?? [];
      if (!rows.length) break;
      if (!access) access = await accessToken(sa);      // only ask Google for a key when there is something to send
      claimed += rows.length;
      for (let i = 0; i < rows.length; i += 25) {
        await Promise.all(rows.slice(i, i + 25).map(async (r) => {
          let ok = 0;
          for (const token of r.tokens ?? []) {
            const res = await sendOne(sa, access, token, r.title, r.body);
            if (res === 'ok') ok++; else if (res === 'dead') dead.push(token);
          }
          delivered += ok;
          const { error: e2 } = await admin.from('greeting_log').update({ devices: (r.tokens ?? []).length, delivered: ok }).eq('user_id', r.user_id).eq('day', r.day);
          if (e2) console.error('send-greetings log', e2.message);
        }));
      }
      if (rows.length < 200) break;
    }
    if (dead.length) await admin.from('device_tokens').delete().in('token', dead);
    return json({ claimed, delivered, removed: dead.length, rounds });
  } catch (e) {
    console.error('send-greetings', e);
    return json({ error: 'error', claimed, delivered }, 500);
  }
});
