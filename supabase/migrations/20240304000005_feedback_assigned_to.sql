-- Allow assigning feedback to a team member (org member user_id)
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN feedback.assigned_to IS 'Team member (user_id) this feedback is assigned to; NULL = unassigned.';
