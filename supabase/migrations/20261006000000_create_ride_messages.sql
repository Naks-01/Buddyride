-- BuddyRide chat storage for the Supabase data model.
-- Messages are stored in a flat table rather than a Firestore-style subcollection.
CREATE TABLE IF NOT EXISTS public.ride_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id text NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('driver', 'passenger')),
  text text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 200),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_messages_ride_created_idx
  ON public.ride_messages (ride_id, created_at);

ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;

-- Chat clients may only change the read flag on existing messages.
REVOKE UPDATE ON public.ride_messages FROM authenticated;
GRANT UPDATE (read) ON public.ride_messages TO authenticated;

DROP POLICY IF EXISTS "ride participants can read chat" ON public.ride_messages;
CREATE POLICY "ride participants can read chat"
  ON public.ride_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.id::text = ride_messages.ride_id
        AND (r.passenger_id::text = auth.uid()::text OR r.driver_id::text = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "ride participants can send chat" ON public.ride_messages;
CREATE POLICY "ride participants can send chat"
  ON public.ride_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.id::text = ride_messages.ride_id
        AND (r.passenger_id::text = auth.uid()::text OR r.driver_id::text = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "ride participants can mark chat read" ON public.ride_messages;
CREATE POLICY "ride participants can mark chat read"
  ON public.ride_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.id::text = ride_messages.ride_id
        AND (r.passenger_id::text = auth.uid()::text OR r.driver_id::text = auth.uid()::text)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.id::text = ride_messages.ride_id
        AND (r.passenger_id::text = auth.uid()::text OR r.driver_id::text = auth.uid()::text)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'ride_messages'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;
  END IF;
END;
$$;
