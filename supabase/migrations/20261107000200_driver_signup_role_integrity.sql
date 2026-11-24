alter table public.profiles alter column role drop default;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_role public.user_role;
begin
  new_role := case
    when new.raw_user_meta_data->>'role' = 'driver' then 'driver'::public.user_role
    else 'passenger'::public.user_role
  end;

  insert into public.profiles (
    id, email, role, full_name, phone, phone_number, is_verified, id_verified, verification_status
  )
  values (
    new.id,
    new.email,
    new_role,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'phone_number', new.raw_user_meta_data->>'phone'),
    coalesce(new.raw_user_meta_data->>'phone_number', new.raw_user_meta_data->>'phone'),
    false,
    false,
    case when new_role = 'driver' then 'not_started' else 'pending' end
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    phone_number = excluded.phone_number;

  return new;
end;
$$;
