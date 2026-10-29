// admin-push — used by the admin dashboard only. Three actions:
//   { action: 'preview' }                          what release is live, can it be announced, and how many phones would be told
//   { action: 'send', confirm_version_code: N }    announce that release once: push to every phone on an older app version
//   { action: 'test_greeting', email, message_id? } send today's greeting (or a chosen one) to one person's phones right now
// Only a signed-in ADMIN may call it (JWT verification stays ON, and is_admin() is checked again below).
// Secrets: FIREBASE_SERVICE_ACCOUNT (already set for send-push). Optional: VERSION_JSON_URL to override where the live version.json is read from.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const DEFAULT_VERSION_URL = 'https://github.com/danielighocode-afk/lifelink.apk-2/releases/latest/download/version.json';

const enc = new TextEncoder();
const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
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
async function sendOne(sa: any, access: string, token: string, title: string, body: string, data: Record<string, string>, android: Record<string, unknown>): Promise<Result> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: title.slice(0, 100), body: body.slice(0, 200) }, data, android } }),
  });
  if (res.ok) return 'ok';
  const err = await res.json().catch(() => ({}));
  const code = err?.error?.details?.find((d: any) => d?.errorCode)?.errorCode ?? err?.error?.status;
  if (code === 'UNREGISTERED' || code === 'NOT_FOUND' || (code === 'INVALID_ARGUMENT' && /registration token/i.test(err?.error?.message ?? ''))) return 'dead';
  console.error('admin-push fcm', res.status, JSON.stringify(err).slice(0, 300));
  return 'fail';
}

// The release that phones will actually be offered: the version.json attached to the latest GitHub release.
async function loadRelease() {
  const url = Deno.env.get('VERSION_JSON_URL') || DEFAULT_VERSION_URL;
  const r = await fetch(url, { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('Could not read the live version.json (' + r.status + '). Is the release published and the repository public?');
  const v: any = await r.json().catch(() => null);
  const code = Number(v?.versionCode);
  if (!v || !Number.isInteger(code) || code < 1 || typeof v.versionName !== 'string' || !v.versionName) throw new Error('The live version.json is missing versionCode or versionName.');
  const apkUrl = typeof v.apkUrl === 'string' ? v.apkUrl : '';
  let apkOk = false;
  if (/^https:\/\//.test(apkUrl)) {
    try {
      let a = await fetch(apkUrl, { method: 'HEAD', redirect: 'follow' });
      if (!a.ok) a = await fetch(apkUrl, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0' } });
      apkOk = a.ok;
    } catch { apkOk = false; }
  }
  return { versionCode: code, versionName: String(v.versionName), notes: typeof v.notes === 'string' ? v.notes : '', apkUrl, force: v.force === true, apkOk };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return json({ error: 'sign in required' }, 401);

  // 1) Only an admin gets past this point.
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ error: 'admin only' }, 403);
  const { data: u } = await userClient.auth.getUser();
  const adminId: string | null = u?.user?.id ?? null;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const action = String(body?.action ?? '');
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  try {
    const needFirebase = () => {
      const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set in Edge Function secrets.');
      try { return JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.'); }
    };

    /* ---------- preview ---------- */
    if (action === 'preview' || action === 'send') {
      const rel = await loadRelease();
      const { data: last } = await db.from('app_announcements').select('version_code').order('version_code', { ascending: false }).limit(1);
      const lastAnnounced: number = last && last.length ? last[0].version_code : 0;
      const total = await db.from('device_tokens').select('id', { count: 'exact', head: true });
      const older = await db.from('device_tokens').select('id', { count: 'exact', head: true }).or(`app_version_code.is.null,app_version_code.lt.${rel.versionCode}`);
      const phonesTotal = total.count ?? 0, phonesToNotify = older.count ?? 0;
      const blockers: string[] = [];
      if (!rel.apkOk) blockers.push('The APK is not downloadable yet. Wait for the GitHub build to finish and the release to appear.');
      if (rel.versionCode <= lastAnnounced) blockers.push('Version ' + rel.versionName + ' (or a newer one) was already announced.');
      if (!phonesToNotify) blockers.push('No registered phones need this update.');
      const preview = {
        release: { version_code: rel.versionCode, version_name: rel.versionName, notes: rel.notes, apk_url: rel.apkUrl, force: rel.force },
        apk_ok: rel.apkOk, last_announced: lastAnnounced, phones_total: phonesTotal, phones_to_notify: phonesToNotify, blockers, can_send: blockers.length === 0,
      };
      if (action === 'preview') return json(preview);

      /* ---------- send ---------- */
      if (Number(body?.confirm_version_code) !== rel.versionCode) return json({ error: 'The live release changed since you opened this screen. Refresh and check it again.' }, 409);
      if (!preview.can_send) return json({ error: blockers[0], blockers }, 409);
      const sa = needFirebase();

      // Record the announcement FIRST. The version number is unique, so a double click or a second admin cannot send it twice.
      const ins = await db.from('app_announcements').insert({
        version_code: rel.versionCode, version_name: rel.versionName, notes: rel.notes || null, announced_by: adminId, targeted: phonesToNotify,
      }).select('id').single();
      if (ins.error) {
        if ((ins.error as any).code === '23505') return json({ error: 'This version was already announced.' }, 409);
        throw new Error(ins.error.message);
      }
      const announcementId = ins.data.id;

      const access = await accessToken(sa);
      const title = `LifeLink ${rel.versionName} is ready 🚀`;
      const text = rel.notes ? (rel.notes.length > 150 ? rel.notes.slice(0, 147) + '...' : rel.notes) : 'A new version is available. Tap to open the app and update.';
      const data = { type: 'update', link: '', title, version_code: String(rel.versionCode) };
      const android = { priority: 'HIGH', ttl: '604800s', notification: { channel_id: 'app_updates' } };
      let sent = 0, failed = 0;
      const dead: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await db.from('device_tokens').select('token')
          .or(`app_version_code.is.null,app_version_code.lt.${rel.versionCode}`).order('id').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!page || !page.length) break;
        for (let i = 0; i < page.length; i += 50) {
          await Promise.all(page.slice(i, i + 50).map(async ({ token }: { token: string }) => {
            const r = await sendOne(sa, access, token, title, text, data, android);
            if (r === 'ok') sent++; else { failed++; if (r === 'dead') dead.push(token); }
          }));
        }
        if (page.length < 1000) break;
      }
      if (dead.length) await db.from('device_tokens').delete().in('token', dead);
      await db.from('app_announcements').update({ sent, failed }).eq('id', announcementId);
      return json({ ok: true, version_name: rel.versionName, targeted: phonesToNotify, sent, failed, removed: dead.length });
    }

    /* ---------- test_greeting ---------- */
    if (action === 'test_greeting') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!email) return json({ error: 'Enter the email of the person to send the test to.' }, 400);
      const { data: p } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
      if (!p) return json({ error: 'No user with that email.' }, 404);
      const { data: toks } = await db.from('device_tokens').select('token').eq('user_id', p.id);
      if (!toks || !toks.length) return json({ error: 'That person has no phone registered for notifications yet (they must open the Android app and allow notifications).' }, 404);
      const mid = body?.message_id == null || body?.message_id === '' ? null : Number(body.message_id);
      const { data: pr, error: prErr } = await db.rpc('greeting_preview', { p_user: p.id, p_message: mid });
      if (prErr || !pr || !pr.length) return json({ error: 'Could not build the greeting (is there an active message?).' }, 400);
      const sa = needFirebase();
      const access = await accessToken(sa);
      let sent = 0;
      const dead: string[] = [];
      for (const { token } of toks) {
        const r = await sendOne(sa, access, token, pr[0].title, pr[0].body, { type: 'greeting', link: '', title: pr[0].title }, { priority: 'HIGH', ttl: '3600s', notification: { channel_id: 'daily_greeting' } });
        if (r === 'ok') sent++; else if (r === 'dead') dead.push(token);
      }
      if (dead.length) await db.from('device_tokens').delete().in('token', dead);
      return json({ ok: true, sent, phones: toks.length, title: pr[0].title, body: pr[0].body });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error('admin-push', e);
    return json({ error: (e as Error).message || 'error' }, 500);
  }
});
