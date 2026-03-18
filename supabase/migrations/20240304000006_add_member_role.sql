-- Add 'member' role: view-only portal (see only assigned feedback, no CRUD).
-- Managers keep full access; only role = 'member' gets the restricted view.
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('admin', 'manager', 'member'));
