alter table public.profiles
  add column if not exists selfie_url text;

update public.profiles
set selfie_url = avatar_url
where role = 'passenger'
  and selfie_url is null
  and avatar_url is not null;
