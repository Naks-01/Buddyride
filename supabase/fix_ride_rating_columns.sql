alter table public.rides add column if not exists driver_rating integer check (driver_rating between 1 and 5);

drop function if exists public.submit_ride_rating(uuid, integer);
create or replace function public.submit_ride_rating(p_ride_id uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ride_row public.rides%rowtype;
  existing_rating public.ride_ratings%rowtype;
  is_passenger boolean;
  old_rating integer;
begin
  if auth.uid() is null or p_rating < 1 or p_rating > 5
    or length(trim(coalesce(p_comment, ''))) > 1000 then
    raise exception 'Provide a rating from 1 to 5 and a comment of at most 1000 characters';
  end if;

  select * into ride_row from public.rides where id = p_ride_id for update;
  if not found or ride_row.status not in ('completed', 'rated') then
    raise exception 'Only completed rides can be rated';
  end if;
  if ride_row.driver_id is null then raise exception 'This ride has no assigned driver'; end if;
  is_passenger := ride_row.passenger_id = auth.uid();
  if not is_passenger and ride_row.driver_id is distinct from auth.uid() then
    raise exception 'Only a ride participant can submit a rating';
  end if;

  select * into existing_rating from public.ride_ratings where ride_id = p_ride_id for update;
  if found then
    old_rating := case when is_passenger then existing_rating.passenger_rating else existing_rating.driver_rating end;
    if old_rating is not null then
      raise exception 'You have already rated this ride';
    end if;
    update public.ride_ratings
    set passenger_rating = case when is_passenger then p_rating else passenger_rating end,
        driver_rating = case when not is_passenger then p_rating else driver_rating end,
        passenger_comment = case when is_passenger then nullif(trim(p_comment), '') else passenger_comment end,
        driver_comment = case when not is_passenger then nullif(trim(p_comment), '') else driver_comment end
    where ride_id = p_ride_id;
  else
    insert into public.ride_ratings (
      ride_id, passenger_id, driver_id, passenger_rating, driver_rating, passenger_comment, driver_comment
    ) values (
      p_ride_id, ride_row.passenger_id, ride_row.driver_id,
      case when is_passenger then p_rating end,
      case when not is_passenger then p_rating end,
      case when is_passenger then nullif(trim(p_comment), '') end,
      case when not is_passenger then nullif(trim(p_comment), '') end
    );
  end if;

  if is_passenger then
    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set rating = (select round(avg(passenger_rating)::numeric, 2) from public.ride_ratings where driver_id = ride_row.driver_id),
        trips_completed = trips_completed + 1
    where id = ride_row.driver_id;
  else
    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set rating = (select round(avg(driver_rating)::numeric, 2) from public.ride_ratings where passenger_id = ride_row.passenger_id),
        trips_completed = trips_completed + 1
    where id = ride_row.passenger_id;
  end if;

  select * into existing_rating from public.ride_ratings where ride_id = p_ride_id;
  perform set_config('buddyride.internal_ride_update', 'on', true);
  update public.rides
  set driver_rating = existing_rating.driver_rating,
      status = case when existing_rating.passenger_rating is not null then 'rated' else status end
  where id = p_ride_id and status in ('completed', 'rated');
end;
$$;

revoke all on function public.submit_ride_rating(uuid, integer, text) from public;
grant execute on function public.submit_ride_rating(uuid, integer, text) to authenticated;
