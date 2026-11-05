alter table public.profiles
  add column if not exists verification_rejection_reason text,
  add column if not exists verified_at timestamptz;
