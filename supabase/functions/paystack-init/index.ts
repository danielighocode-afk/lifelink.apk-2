// paystack-init — starts a wallet deposit.
// Auth: caller's Supabase JWT (verify_jwt = true). Secrets: PAYSTACK_SECRET_KEY (set by you), and the
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY that Supabase injects automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) return json({ error: 'Payments are not configured yet (missing PAYSTACK_SECRET_KEY).' }, 500);

    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: 'Please sign in again.' }, 401);
    const user = u.user;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount_kobo);
    if (!Number.isInteger(amount)) return json({ error: 'Enter a valid amount.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const reference = 'll_' + crypto.randomUUID().replaceAll('-', '');

    // Validates role, minimum (₦500) and maximum, and records the pending attempt.
    const { error: se } = await admin.rpc('wallet_start_deposit', {
      p_user: user.id, p_reference: reference, p_amount_kobo: amount,
    });
    if (se) return json({ error: se.message }, 400);

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email, amount, currency: 'NGN', reference,
        metadata: { purpose: 'lifelink_wallet_deposit', user_id: user.id },
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.status) {
      await admin.rpc('wallet_fail_deposit', { p_reference: reference, p_status: 'failed', p_gateway_response: String(out?.message ?? 'init failed').slice(0, 200) });
      return json({ error: 'Could not start the payment. Please try again.' }, 502);
    }
    return json({ reference, access_code: out.data.access_code, authorization_url: out.data.authorization_url, email: user.email });
  } catch (e) {
    console.error('paystack-init', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
