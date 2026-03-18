-- Add manager role + departments + assignments + customer messages

-- 1) Allow 'manager' role in organization_members (migrate old 'member' to 'manager' first)
UPDATE organization_members SET role = 'manager' WHERE role = 'member';

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('admin', 'manager'));

-- Tighten org member write access: only admins can manage members (bootstrap remains handled via service role / initial migration)
DROP POLICY IF EXISTS org_members_update ON organization_members;
CREATE POLICY org_members_update ON organization_members
  FOR UPDATE USING (
    organization_id IN (SELECT user_organization_ids())
    AND is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS org_members_insert ON organization_members;
CREATE POLICY org_members_insert ON organization_members
  FOR INSERT WITH CHECK (
    is_vamo_user()
    AND organization_id IN (SELECT user_organization_ids())
    AND is_org_admin(organization_id)
  );

-- 2) Departments (org-scoped)
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select ON departments
  FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));

-- Only admins can create/update/delete departments
CREATE POLICY departments_admin_write ON departments
  FOR ALL USING (
    organization_id IN (SELECT user_organization_ids()) AND is_org_admin(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT user_organization_ids()) AND is_org_admin(organization_id)
  );

-- Seed default departments for existing org(s)
INSERT INTO departments (organization_id, name)
SELECT o.id, d.name
FROM organizations o
CROSS JOIN (VALUES
  ('Support'),
  ('Engineering'),
  ('Sales'),
  ('Operations')
) AS d(name)
ON CONFLICT DO NOTHING;

-- 3) Feedback assignment fields
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS resolution_notes text;

-- 4) Customer messages linked to feedback (outbound updates)
CREATE TABLE IF NOT EXISTS customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  sent_via text NOT NULL DEFAULT 'manual' CHECK (sent_via IN ('manual', 'email')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_messages_select ON customer_messages
  FOR SELECT USING (
    feedback_id IN (
      SELECT id FROM feedback WHERE organization_id IN (SELECT user_organization_ids())
    )
  );

CREATE POLICY customer_messages_insert ON customer_messages
  FOR INSERT WITH CHECK (
    feedback_id IN (
      SELECT id FROM feedback WHERE organization_id IN (SELECT user_organization_ids())
    )
  );

