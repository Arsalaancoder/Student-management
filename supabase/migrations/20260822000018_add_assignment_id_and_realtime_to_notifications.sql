-- Migration: Add assignment_id column to notifications table and enable Realtime

-- 1. Add assignment_id column if it does not exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'notifications' 
          AND column_name = 'assignment_id'
    ) THEN 
        ALTER TABLE public.notifications 
        ADD COLUMN assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Ensure public.notifications is added to supabase_realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_class c ON pr.prrelid = c.oid
      JOIN pg_publication p ON pr.prpubid = p.oid
      WHERE p.pubname = 'supabase_realtime' AND c.relname = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
