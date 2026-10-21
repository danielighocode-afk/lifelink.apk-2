-- LifeLink 007 — instant notification pop-ups. Re-runnable. Run AFTER 006_maps.sql.
-- Adds public.notifications to the realtime publication so the app can show a pop-up the moment a row is created.
-- RLS still applies: each person only receives their own rows. Without this the app still works: it polls every 4 seconds.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add notifications to the realtime publication (%). Pop-ups fall back to polling every 4 s.', SQLERRM;
END $$;
