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

  await t.test('a changed identity locks the album again', async () => {
    await db.query("update auth.users set email = 'different@example.test' where id = $1", [partner]);
    assert.equal(await albumCount(owner), 0);
    assert.equal(await albumCount(partner), 0);
    assert.equal(await status(owner), 'unavailable');
  });
});
