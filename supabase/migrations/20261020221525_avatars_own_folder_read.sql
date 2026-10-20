-- Close anonymous listing of the avatars bucket.
--
-- 20260901000000_avatars_bucket.sql gave storage.objects a SELECT policy open
-- to everyone on the whole bucket, so that leaderboards could show other
-- learners' avatars. That policy was never needed for it: a PUBLIC bucket
-- serves /storage/v1/object/public/... without consulting RLS, and that URL is
-- the only way the app reads someone else's avatar (src/lib/avatar.js).
--
-- What the policy did grant was storage's list call. Anyone holding the
-- publishable key could list the bucket, getting every user id folder and
-- every random filename in it. The random segment is the only thing keeping an
-- avatar URL unguessable (see the path convention in that migration), so the
-- list handed out every learner's picture. Production answered an anonymous
-- list on 2026-10-21 (docs/security/Security Checklist.md, row 10).
--
-- The replacement keeps SELECT, narrowed to the signed-in owner's own folder.
-- Upload does not need it, but remove() and move() read the row they act on:
-- with no SELECT policy at all, a learner could upload a new avatar and never
-- delete the one it replaced (checked on the local stack, where exactly the
-- own-folder list, delete and rename tests fail). The service role bypasses
-- RLS, so account deletion (api/_lib/accountEndpoints.js) still lists and
-- removes the folder.
--
-- Drop + create rather than ALTER POLICY, because the name changes with the
-- meaning: "avatars are publicly readable" would be false. Both statements run
-- in the migration's transaction, and dropping a permissive SELECT policy
-- closes access rather than opening it, so there is no exposed window.
-- supabase/tests/rls/storage.test.js stages the listing tests red on the old
-- policy.

drop policy if exists "avatars are publicly readable" on storage.objects;

drop policy if exists "read own avatar" on storage.objects;
create policy "read own avatar" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
