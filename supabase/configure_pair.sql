-- Run privately as the project database owner after inviting two Auth users.
-- Replace these sample addresses in your SQL editor. Do not commit real addresses.
do $$
declare
  expected_owner constant text := 'owner@example.test';
  expected_partner constant text := 'partner@example.test';
  owner_user uuid;
  partner_user uuid;
  album uuid;
begin
  select id into strict owner_user from auth.users where lower(email) = expected_owner;
  select id into strict partner_user from auth.users where lower(email) = expected_partner;
  select id into strict album from public.albums;
  insert into for_her_private.pairing (album_id, owner_id, owner_email, partner_id, partner_email)
  values (album, owner_user, expected_owner, partner_user, expected_partner);
end;
$$;
