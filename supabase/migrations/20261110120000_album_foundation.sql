create schema for_her_private;
revoke all on schema for_her_private from public, anon, authenticated;

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
alter table public.albums enable row level security;
revoke all on public.albums from public, anon, authenticated;
grant select on public.albums to authenticated;

insert into public.albums (name) values ('For Her');

create table for_her_private.pairing (
  singleton boolean primary key default true check (singleton),
  album_id uuid not null references public.albums (id),
  owner_id uuid not null,
  owner_email text not null check (owner_email = lower(btrim(owner_email)) and owner_email <> ''),
  partner_id uuid not null check (partner_id <> owner_id),
  partner_email text not null check (
    partner_email = lower(btrim(partner_email)) and partner_email <> '' and partner_email <> owner_email
  ),
  invite_hash bytea,
  expires_at timestamptz,
  paired_at timestamptz,
  check ((invite_hash is null) = (expires_at is null)),
  check (paired_at is null or invite_hash is null)
);
alter table for_her_private.pairing enable row level security;
revoke all on for_her_private.pairing from public, anon, authenticated;

create function for_her_private.is_verified(member_id uuid, expected_email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select from auth.users
    where id = member_id
      and email_confirmed_at is not null
      and lower(email) = expected_email
  );
$$;

create function public.can_access_album(target_album uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select from for_her_private.pairing p
    where p.album_id = target_album
      and p.paired_at is not null
      and (select auth.uid()) in (p.owner_id, p.partner_id)
      and for_her_private.is_verified(p.owner_id, p.owner_email)
      and for_her_private.is_verified(p.partner_id, p.partner_email)
  );
$$;

create policy "Verified pair reads its album"
on public.albums for select to authenticated
using (public.can_access_album(id));

create function public.album_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when public.can_access_album(p.album_id) then 'active'
      when p.paired_at is not null then 'unavailable'
      when p.owner_id = (select auth.uid())
        and for_her_private.is_verified(p.owner_id, p.owner_email)
        then case when p.expires_at > now() then 'owner_waiting' else 'owner_ready' end
      when p.partner_id = (select auth.uid())
        and for_her_private.is_verified(p.partner_id, p.partner_email)
        then case when p.expires_at > now() then 'partner_ready' else 'partner_waiting' end
      else 'unavailable'
    end
    from for_her_private.pairing p
    where (select auth.uid()) in (p.owner_id, p.partner_id)
  ), 'unavailable');
$$;

create function public.issue_album_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_code text := replace(gen_random_uuid()::text, '-', '');
begin
  update for_her_private.pairing
  set invite_hash = sha256(convert_to(invite_code, 'UTF8')),
      expires_at = clock_timestamp() + interval '24 hours'
  where owner_id = (select auth.uid())
    and paired_at is null
    and for_her_private.is_verified(owner_id, owner_email);
  if not found then
    raise exception 'Only the verified album owner can create an invitation before pairing.';
  end if;
  return invite_code;
end;
$$;

create function public.revoke_album_invite()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update for_her_private.pairing
  set invite_hash = null, expires_at = null
  where owner_id = (select auth.uid())
    and paired_at is null
    and for_her_private.is_verified(owner_id, owner_email);
  if not found then
    raise exception 'Only the verified album owner can revoke an invitation before pairing.';
  end if;
end;
$$;

create function public.accept_album_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair for_her_private.pairing%rowtype;
  code text := lower(btrim(invite_code));
begin
  if code is null or code !~ '^[0-9a-f]{32}$' then
    return false;
  end if;

  select * into pair
  from for_her_private.pairing p
  where p.partner_id = (select auth.uid()) and p.paired_at is null
  for update;

  if not found
    or pair.invite_hash is null
    or pair.expires_at <= clock_timestamp()
    or pair.invite_hash <> sha256(convert_to(code, 'UTF8'))
    or not for_her_private.is_verified(pair.owner_id, pair.owner_email)
    or not for_her_private.is_verified(pair.partner_id, pair.partner_email)
  then
    return false;
  end if;

  update for_her_private.pairing
  set paired_at = clock_timestamp(), invite_hash = null, expires_at = null
  where singleton = pair.singleton;
  return true;
end;
$$;

revoke all on function for_her_private.is_verified(uuid, text) from public, anon, authenticated;
revoke all on function public.can_access_album(uuid),
  public.album_status(), public.issue_album_invite(), public.revoke_album_invite(),
  public.accept_album_invite(text) from public, anon, authenticated;
grant execute on function public.can_access_album(uuid),
  public.album_status(), public.issue_album_invite(), public.revoke_album_invite(),
  public.accept_album_invite(text) to authenticated;

-- Keep the bucket closed in Phase 1, even if another bucket uses a broad policy.
insert into storage.buckets (id, name, public)
values ('album-media', 'album-media', false);

create policy "Phase 1 closes the album media bucket"
on storage.objects as restrictive for all to public
using (bucket_id <> 'album-media')
with check (bucket_id <> 'album-media');
