create table public.places (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  unique (id, album_id)
);
create unique index places_location_name_key on public.places (
  album_id, lower(name), round(latitude::numeric, 5), round(longitude::numeric, 5)
);

create table public.visits (
  id uuid primary key,
  album_id uuid not null references public.albums(id),
  place_id uuid not null,
  visited_on date not null check (isfinite(visited_on) and visited_on >= date '0001-01-01'),
  brief text not null check (brief = btrim(brief) and length(brief) between 1 and 5000),
  category text not null check (category in ('days_out', 'trips', 'food_drink', 'little_moments')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (place_id, album_id) references public.places(id, album_id)
);
create index visits_place_history on public.visits (place_id, visited_on desc, created_at desc);
create index visits_album_history on public.visits (album_id, visited_on desc, created_at desc);

alter table public.places enable row level security;
alter table public.visits enable row level security;
revoke all on public.places, public.visits from public, anon, authenticated;
grant select, insert on public.places, public.visits to authenticated;

create policy "Pair reads places" on public.places for select to authenticated
using (public.can_access_album(album_id));
create policy "Pair adds places" on public.places for insert to authenticated
with check (public.can_access_album(album_id));
create policy "Pair reads visits" on public.visits for select to authenticated
using (public.can_access_album(album_id));
create policy "Pair adds visits" on public.visits for insert to authenticated
with check (public.can_access_album(album_id) and created_by = (select auth.uid()));

-- An RPC runs in one transaction, so a failed visit leaves no new place behind.
-- Reusing the request UUID returns the same visit and never creates a second visit.
create function public.save_visit(
  request_id uuid, target_album uuid, existing_place uuid,
  place_name text, place_lat double precision, place_lon double precision,
  visit_date date, visit_brief text, visit_category text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  location_id uuid;
  saved public.visits%rowtype;
  cleaned_name text := btrim(place_name);
  cleaned_brief text := btrim(visit_brief);
begin
  if not public.can_access_album(target_album) then
    raise exception 'Album access required.' using errcode = '42501';
  end if;
  if request_id is null then
    raise exception 'A request ID is required.';
  end if;

  -- Serialize saves with the same request ID, including concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(request_id::text, 0));
  select * into saved from public.visits where id = request_id;
  if found then
    if saved.album_id <> target_album or saved.created_by <> (select auth.uid()) then
      raise exception 'Request ID already used.';
    end if;
    return saved.id;
  end if;

  if existing_place is not null then
    select id into strict location_id from public.places
    where id = existing_place and album_id = target_album;
  else
    insert into public.places (album_id, name, latitude, longitude)
    values (target_album, cleaned_name, place_lat, place_lon)
    on conflict do nothing returning id into location_id;

    if location_id is null then
      select id into strict location_id from public.places
      where album_id = target_album and lower(name) = lower(cleaned_name)
        and round(latitude::numeric, 5) = round(place_lat::numeric, 5)
        and round(longitude::numeric, 5) = round(place_lon::numeric, 5);
    end if;
  end if;

  insert into public.visits (id, album_id, place_id, visited_on, brief, category)
  values (request_id, target_album, location_id, visit_date, cleaned_brief, visit_category);
  return request_id;
end;
$$;
revoke all on function public.save_visit(uuid, uuid, uuid, text, double precision, double precision, date, text, text)
from public, anon, authenticated;
grant execute on function public.save_visit(uuid, uuid, uuid, text, double precision, double precision, date, text, text)
to authenticated;

-- Return one database snapshot, avoiding mismatched place/visit reads or API row caps.
create function public.read_album()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'albumId', a.id,
    'places', (select coalesce(jsonb_agg(to_jsonb(p) order by p.name, p.id), '[]'::jsonb)
      from public.places p where p.album_id = a.id),
    'visits', (select coalesce(jsonb_agg(to_jsonb(v) - 'created_by'
      order by v.visited_on desc, v.created_at desc, v.id desc), '[]'::jsonb)
      from public.visits v where v.album_id = a.id)
  ) from public.albums a;
$$;
revoke all on function public.read_album() from public, anon, authenticated;
grant execute on function public.read_album() to authenticated;
