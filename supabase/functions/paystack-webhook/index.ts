// paystack-webhook — Paystack calls this server-to-server. Deploy with JWT verification OFF
// (supabase/config.toml has verify_jwt = false for it); authenticity comes from the HMAC signature.
// Steps: 1) check x-paystack-signature = HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY)
//        2) for charge.success, ASK PAYSTACK again via the verify API (never trust the payload alone)
//        3) credit idempotently by reference (duplicates / retries are harmless)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return new Response('not configured', { status: 500 });

  const raw = await req.text();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(raw)));
  const given = (req.headers.get('x-paystack-signature') ?? '').toLowerCase();
  if (!safeEqual(expected, given)) return new Response('invalid signature', { status: 401 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }

  // Only wallet-deposit events matter; everything else is acknowledged and ignored.
  if (evt?.event !== 'charge.success') return new Response('ignored', { status: 200 });
  const reference = evt?.data?.reference;
  if (typeof reference !== 'string' || !/^ll_[a-f0-9]{32}$/.test(reference)) return new Response('ignored', { status: 200 });

  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.status) return new Response('verify failed', { status: 502 }); // Paystack will retry
    const d = out.data;
    if (d.status !== 'success' || d.currency !== 'NGN') return new Response('not successful', { status: 200 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.rpc('wallet_credit_deposit', {
      p_reference: reference, p_paid_kobo: d.amount, p_gateway_response: String(d.gateway_response ?? '').slice(0, 200),
    });
    if (error) {
      if (/unknown deposit reference/i.test(error.message)) return new Response('unknown reference', { status: 200 });
      console.error('webhook credit error', error.message);
      return new Response('error', { status: 500 }); // retry later
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('paystack-webhook', e);
    return new Response('error', { status: 500 });
  }
});
