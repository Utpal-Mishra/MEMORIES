-- Use Storage objects as the source of truth for completed attachments.
-- An object path is album ID / visit ID / photo ID plus an allowed extension.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'album-media' and not public;

create function for_her_private.can_access_visit_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    then exists (
      select 1 from public.visits v
      where v.id = split_part(object_name, '/', 2)::uuid
        and v.album_id = split_part(object_name, '/', 1)::uuid
        and public.can_access_album(v.album_id)
    )
    else false
  end;
$$;
revoke all on function for_her_private.can_access_visit_photo(text) from public, anon, authenticated;
grant execute on function for_her_private.can_access_visit_photo(text) to anon, authenticated;

drop policy "Phase 1 closes the album media bucket" on storage.objects;
create policy "Album photo paths require an accessible visit"
on storage.objects as restrictive for all to public
using (bucket_id <> 'album-media' or for_her_private.can_access_visit_photo(name))
with check (bucket_id <> 'album-media' or for_her_private.can_access_visit_photo(name));

-- Disallow overwrites, moves and cross-bucket moves even with broader policies.
create policy "Album photo objects cannot be updated"
on storage.objects as restrictive for update to public
using (bucket_id <> 'album-media')
with check (bucket_id <> 'album-media');

create policy "Pair reads album photo objects" on storage.objects for select to authenticated
using (bucket_id = 'album-media');
create policy "Pair uploads album photo objects" on storage.objects for insert to authenticated
with check (bucket_id = 'album-media');
create policy "Pair removes album photo objects" on storage.objects for delete to authenticated
using (bucket_id = 'album-media');

-- A photo-only visit remains available to retry its attachment if upload fails.
alter table public.visits drop constraint visits_brief_check;
alter table public.visits add constraint visits_brief_check
check (brief = btrim(brief) and length(brief) <= 5000);

drop function public.save_visit(uuid, uuid, uuid, text, double precision, double precision, date, text, text);
create function public.save_visit(
  request_id uuid, target_album uuid, existing_place uuid,
  place_name text, place_lat double precision, place_lon double precision,
  visit_date date, visit_brief text, visit_category text, allow_empty_brief boolean default false
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
  if cleaned_brief = '' and not coalesce(allow_empty_brief, false) then
    raise exception 'Visit description required.' using errcode = '23514';
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
revoke all on function public.save_visit(uuid, uuid, uuid, text, double precision, double precision, date, text, text, boolean)
from public, anon, authenticated;
grant execute on function public.save_visit(uuid, uuid, uuid, text, double precision, double precision, date, text, text, boolean)
to authenticated;

create or replace function public.read_album()
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
      from public.visits v where v.album_id = a.id),
    'photoPaths', (select coalesce(jsonb_agg(o.name order by o.created_at desc, o.name), '[]'::jsonb)
      from storage.objects o
      where o.bucket_id = 'album-media' and o.name like a.id::text || '/%')
  ) from public.albums a;
$$;
revoke all on function public.read_album() from public, anon, authenticated;
grant execute on function public.read_album() to authenticated;
