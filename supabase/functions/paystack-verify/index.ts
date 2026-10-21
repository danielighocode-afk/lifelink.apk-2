// paystack-verify — called by the browser AFTER the Paystack popup closes, and by the "Check payment" button.
// It never trusts the browser: it asks Paystack's API for the truth, then credits idempotently.
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
    if (!secret) return json({ error: 'Payments are not configured yet.' }, 500);

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: 'Please sign in again.' }, 401);

    const { reference } = await req.json().catch(() => ({}));
    if (typeof reference !== 'string' || !/^ll_[a-f0-9]{32}$/.test(reference)) return json({ error: 'Invalid reference.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: dep } = await admin.from('wallet_deposits').select('user_id,status,credited_at,amount_kobo').eq('reference', reference).maybeSingle();
    if (!dep || dep.user_id !== u.user.id) return json({ error: 'Deposit not found.' }, 404);
    if (dep.credited_at) return json({ status: 'success', credited: true });

    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.status) return json({ status: 'pending', credited: false, message: 'Paystack has not confirmed this payment yet.' });

    const d = out.data;
    if (d.status === 'success' && d.currency === 'NGN') {
      const { data: r, error } = await admin.rpc('wallet_credit_deposit', {
        p_reference: reference, p_paid_kobo: d.amount, p_gateway_response: String(d.gateway_response ?? '').slice(0, 200),
      });
      if (error) return json({ error: error.message }, 400);
      if (r === 'amount_mismatch') return json({ status: 'failed', credited: false, message: 'The amount paid did not match. Contact support.' });
      return json({ status: 'success', credited: true });
    }
    if (d.status === 'failed' || d.status === 'abandoned') {
      await admin.rpc('wallet_fail_deposit', { p_reference: reference, p_status: d.status, p_gateway_response: String(d.gateway_response ?? '').slice(0, 200) });
      return json({ status: d.status, credited: false });
    }
    return json({ status: 'pending', credited: false });
  } catch (e) {
    console.error('paystack-verify', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
