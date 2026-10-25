-- LifeLink 014 — message ticks (sent / delivered / read) and instant updates. Re-runnable. Run AFTER 013.
-- Adds messages.delivered_at, functions the recipient's app calls to record delivery, and puts messages on the realtime feed.
-- RLS is unchanged: people only ever see messages of conversations they belong to.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
-- Messages that already exist are treated as delivered (read ones too).
UPDATE public.messages SET delivered_at = COALESCE(read_at, created_at) WHERE delivered_at IS NULL;

-- The recipient's app has received messages in one conversation.
CREATE OR REPLACE FUNCTION public.mark_conversation_delivered(p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation AND v_uid IN (customer_id, provider_id)) THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;
  UPDATE public.messages SET delivered_at = now() WHERE conversation_id = p_conversation AND sender_id <> v_uid AND delivered_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.mark_conversation_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_delivered(uuid) TO authenticated;

-- The recipient's app is open: everything waiting for me, in every conversation, counts as delivered.
CREATE OR REPLACE FUNCTION public.mark_all_delivered()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  UPDATE public.messages m SET delivered_at = now()
  FROM public.conversations c
  WHERE m.conversation_id = c.id AND v_uid IN (c.customer_id, c.provider_id)
    AND m.sender_id <> v_uid AND m.delivered_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.mark_all_delivered() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_delivered() TO authenticated;

-- Reading a message also means it was delivered.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation AND v_uid IN (customer_id, provider_id)) THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;
  UPDATE public.messages SET read_at = now(), delivered_at = COALESCE(delivered_at, now())
  WHERE conversation_id = p_conversation AND sender_id <> v_uid AND read_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Instant updates: put messages on the realtime feed (the chat still checks every 8 s if this cannot be done).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add messages to the realtime publication (%). Chats fall back to checking every 8 s.', SQLERRM;
END $$;
