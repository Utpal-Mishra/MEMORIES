import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const partner = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const migration = new URL('../supabase/migrations/20261110120000_album_foundation.sql', import.meta.url);
const provision = new URL('../supabase/configure_pair.sql', import.meta.url);

test('pairing, album RLS and media isolation on Postgres', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  // Minimal Supabase schemas. The production migration runs unchanged.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert on storage.objects to anon, authenticated;
    create policy "fixture broad access" on storage.objects for all to public
      using (true) with check (true);
    insert into auth.users (id, email, email_confirmed_at) values
      ('${owner}', 'owner@example.test', null),
      ('${partner}', 'partner@example.test', null),
      ('${outsider}', 'outsider@example.test', now());
  `);
  await db.exec(await readFile(migration, 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261110220000_places_and_visits.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(provision, 'utf8'));
  await db.exec("insert into storage.objects values ('album-media', 'synthetic.jpg'), ('other', 'allowed.jpg')");

  async function actingAs(id, operation) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec(id ? 'set role authenticated' : 'set role anon');
    try {
      return await operation();
    } finally {
      await db.exec('reset role');
    }
  }

  async function call(id, sql, args = []) {
    return actingAs(id, async () => (await db.query(sql, args)).rows[0]?.value);
  }

  const status = (id) => call(id, 'select public.album_status() as value');
  const issue = (id) => call(id, 'select public.issue_album_invite() as value');
  const revoke = (id) => call(id, 'select public.revoke_album_invite() as value');
  const accept = (id, code) => call(id, 'select public.accept_album_invite($1) as value', [code]);
  const albumCount = (id) => call(id, 'select count(*)::integer as value from public.albums');
  const mediaCount = (id) => call(id, "select count(*)::integer as value from storage.objects where bucket_id = 'album-media'");

  await t.test('anonymous, unrelated and unverified accounts cannot open or pair an album', async () => {
    await assert.rejects(status(null), /permission denied/);
    await assert.rejects(albumCount(null), /permission denied/);
    assert.equal(await status(outsider), 'unavailable');
    assert.equal(await status(owner), 'unavailable');
    assert.equal(await albumCount(outsider), 0);
    await assert.rejects(issue(owner), /Only the verified album owner/);
    await assert.rejects(issue(outsider), /Only the verified album owner/);
    await assert.rejects(call(outsider, 'select * from for_her_private.pairing'), /permission denied/);
  });

  let liveCode;
  await t.test('verified owner can issue, replace and revoke invitations', async () => {
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [owner]);
    assert.equal(await status(owner), 'owner_ready');
    assert.equal(await albumCount(owner), 0);
    const revokedCode = await issue(owner);
    assert.match(revokedCode, /^[0-9a-f]{32}$/);
    assert.equal(await status(owner), 'owner_waiting');
    assert.equal(await accept(partner, revokedCode), false);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [partner]);
    await assert.rejects(revoke(partner), /Only the verified album owner/);
    await revoke(owner);
    assert.equal(await accept(partner, revokedCode), false);
    assert.equal(await status(partner), 'partner_waiting');

    const oldCode = await issue(owner);
    const expiredCode = await issue(owner);
    assert.equal(await status(partner), 'partner_ready');
    assert.equal(await accept(partner, oldCode), false);
    await db.exec("update for_her_private.pairing set expires_at = now() - interval '1 second'");
    assert.equal(await accept(partner, expiredCode), false);
    assert.equal(await status(owner), 'owner_ready');
    liveCode = await issue(owner);
    assert.equal(await albumCount(partner), 0);
  });

  await t.test('only the intended verified partner can use the code, once', async () => {
    assert.equal(await accept(outsider, liveCode), false);
    assert.equal(await accept(owner, liveCode), false);
    assert.equal(await accept(partner, 'a'.repeat(32)), false);
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [owner]);
    assert.equal(await accept(partner, liveCode), false);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [owner]);
    assert.equal(await accept(partner, liveCode.toUpperCase()), true);
    assert.equal(await accept(partner, liveCode), false);
    await assert.rejects(issue(owner), /Only the verified album owner/);
    assert.equal(await status(owner), 'active');
    assert.equal(await status(partner), 'active');
    assert.equal(await albumCount(owner), 1);
    assert.equal(await albumCount(partner), 1);
    assert.equal(await albumCount(outsider), 0);
    await assert.rejects(call(owner, "insert into public.albums (name) values ('Another album')"), /permission denied/);
  });

  await t.test('the reserved bucket denies client access even with a broad storage policy', async () => {
    assert.equal((await db.query("select public from storage.buckets where id = 'album-media'")).rows[0].public, false);
    for (const identity of [null, owner, partner, outsider]) {
      assert.equal(await mediaCount(identity), 0);
      assert.equal(await call(identity, 'select count(*)::integer as value from storage.objects'), 1);
    }
    await assert.rejects(call(owner, "insert into storage.objects values ('album-media', 'upload.jpg')"), /row-level security/);
  });

  await t.test('paired users save and reopen dated visits with retries and place reuse', async () => {
    const album = (await db.query('select id from public.albums')).rows[0].id;
    const first = '10000000-0000-4000-8000-000000000001';
    const second = '10000000-0000-4000-8000-000000000002';
    const third = '10000000-0000-4000-8000-000000000003';
    const save = (id, request, name, lat, existing = null, brief = 'A synthetic visit.') => call(id,
      'select public.save_visit($1,$2,$3,$4,$5,-6.26,$6,$7,$8) as value',
      [request, album, existing, name, lat, '2026-10-25', brief, 'days_out']);

    await assert.rejects(call(null, 'select public.read_album() as value'), /permission denied/);
    await assert.rejects(save(outsider, first, 'Sample place', 53.35), /Album access required/);
    assert.equal(await save(owner, first, 'Sample place', 53.35), first);
    assert.equal(await save(owner, first, 'Sample place', 53.35), first);
    assert.equal((await db.query('select count(*)::int as n from public.visits')).rows[0].n, 1);
    assert.equal(await save(partner, second, 'SAMPLE PLACE', 53.3500001), second);
    assert.equal((await db.query('select count(*)::int as n from public.places')).rows[0].n, 1);
    const place = (await db.query('select id from public.places')).rows[0].id;
    assert.equal(await save(owner, third, null, null, place), third);
    const snapshot = await call(partner, 'select public.read_album() as value');
    assert.equal(snapshot.places.length, 1);
    assert.equal(snapshot.visits.length, 3);
    assert.equal(snapshot.visits[0].place_id, place);
    assert.equal(snapshot.visits[0].brief, 'A synthetic visit.');
    assert.equal(await call(outsider, 'select public.read_album() as value'), null);
    assert.equal(await call(outsider, 'select count(*)::int as value from public.places'), 0);
    assert.equal(await call(outsider, 'select count(*)::int as value from public.visits'), 0);
    await assert.rejects(save(partner, first, 'Sample place', 53.35), /Request ID already used/);

    await assert.rejects(save(owner, '10000000-0000-4000-8000-000000000004', 'Failed place', 51.2, null, ''), /check constraint/);
    assert.equal((await db.query('select count(*)::int as n from public.places')).rows[0].n, 1);
    await assert.rejects(save(owner, '10000000-0000-4000-8000-000000000005', 'Bad coordinates', 91), /check constraint/);
    await assert.rejects(call(owner,
      "insert into public.visits(id,album_id,place_id,visited_on,brief,category,created_by) values (gen_random_uuid(),$1,$2,'2026-10-25','Synthetic','days_out',$3)",
      [album, place, outsider]), /row-level security/);
  });

  await t.test('a changed identity locks the album again', async () => {
    await db.query("update auth.users set email = 'different@example.test' where id = $1", [partner]);
    assert.equal(await albumCount(owner), 0);
    assert.equal(await albumCount(partner), 0);
    assert.equal(await status(owner), 'unavailable');
    assert.equal(await call(owner, 'select public.read_album() as value'), null);
    assert.equal(await call(partner, 'select count(*)::int as value from public.visits'), 0);
  });
});
