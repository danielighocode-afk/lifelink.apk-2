// send-push — called by a Supabase Database Webhook on every INSERT into public.notifications.
// Finds the person's saved phones (public.device_tokens) and sends the notification through Firebase Cloud Messaging (HTTP v1).
// Secrets (Edge Functions -> Secrets): FIREBASE_SERVICE_ACCOUNT = the whole service-account JSON file,
//                                      PUSH_WEBHOOK_SECRET     = any long random text (the webhook sends it in the x-webhook-secret header).
// Deploy with JWT verification OFF (supabase/config.toml has verify_jwt = false for it); the secret header protects this endpoint.
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

// Google access token for FCM, signed with the service-account key; reused until shortly before it expires.
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!secret || !saRaw) return new Response('not configured', { status: 500 });
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });

  let evt: any;
  try { evt = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const n = evt?.record;
  if (evt?.type !== 'INSERT' || evt?.table !== 'notifications' || !n?.user_id) return new Response('ignored', { status: 200 });

  let sa: any;
  try { sa = JSON.parse(saRaw); } catch { return new Response('FIREBASE_SERVICE_ACCOUNT is not valid JSON', { status: 500 }); }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: rows, error } = await admin.from('device_tokens').select('token').eq('user_id', n.user_id);
    if (error) { console.error('send-push lookup', error.message); return new Response('lookup failed', { status: 500 }); }
    if (!rows || !rows.length) return new Response('no devices', { status: 200 });

    const access = await accessToken(sa);
    const notification: Record<string, string> = { title: String(n.title ?? 'LifeLink').slice(0, 100) };
    if (n.body) notification.body = String(n.body).slice(0, 200);
    const data = {
      link: String(n.link ?? ''),
      notification_id: String(n.id ?? ''),
      type: String(n.type ?? ''),
      title: String(n.title ?? ''),
    };

    let sent = 0;
    const dead: string[] = [];
    await Promise.all(rows.map(async ({ token }: { token: string }) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification,
            data,
            android: { priority: 'HIGH', notification: { channel_id: 'lifelink_default' } },
          },
        }),
      });
      if (res.ok) { sent++; return; }
      const err = await res.json().catch(() => ({}));
      const code = err?.error?.details?.find((d: any) => d?.errorCode)?.errorCode ?? err?.error?.status;
      // Firebase says this phone can never receive again (app removed, token expired): forget it.
      if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || (code === 'INVALID_ARGUMENT' && /registration token/i.test(err?.error?.message ?? ''))) dead.push(token);
      else console.error('send-push fcm', res.status, JSON.stringify(err).slice(0, 300));
    }));
    if (dead.length) await admin.from('device_tokens').delete().in('token', dead);
    return new Response(JSON.stringify({ sent, removed: dead.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-push', e);
    return new Response('error', { status: 500 });
  }
});
