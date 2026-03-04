-- Remove team invitation logic: drop invites table and its RLS policies.
-- Run this if your database was created with the old schema that included invites.

DROP POLICY IF EXISTS invites_select ON invites;
DROP POLICY IF EXISTS invites_insert ON invites;
DROP POLICY IF EXISTS invites_delete ON invites;
DROP TABLE IF EXISTS invites;
