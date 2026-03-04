-- Customer Feedback Dashboard: initial schema + RLS
-- Only @vamo.app users can sign up; RLS enforces all access.

-- Helper: true if current user's email is @vamo.app
CREATE OR REPLACE FUNCTION is_vamo_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (current_setting('request.jwt.claims', true)::json ->> 'email') LIKE '%@vamo.app',
    false
  );
$$;

-- Organizations (one per company; all @vamo.app users belong to one org for this product)
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Vamo',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Link users to organizations with roles (after auth signup)
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Pending invites (email not yet signed up)
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email)
);

-- Tags (global list; org-scoped if you want per-org tags later)
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE
);

-- Seed default tags per acceptance criteria A02
INSERT INTO tags (name, slug) VALUES
  ('UI', 'ui'),
  ('Bug', 'bug'),
  ('Search Bar', 'search-bar'),
  ('Search Results', 'search-results'),
  ('Filter', 'filter'),
  ('Sequences', 'sequences'),
  ('Inbox', 'inbox'),
  ('Integrations', 'integrations'),
  ('Positive Feedback', 'positive-feedback'),
  ('Negative Feedback', 'negative-feedback'),
  ('Unassigned', 'unassigned');

-- Customers (by email per org; display name optional)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email)
);

-- Feedback entries
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_email text, -- NULL = unassigned (A01.3)
  subject text,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'planned', 'in_progress', 'resolved', 'reviewed')),
  urgency_score int CHECK (urgency_score >= 1 AND urgency_score <= 5),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('email', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Attachments (screenshots); OCR text stored for search/display
CREATE TABLE feedback_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Many-to-many: feedback <-> tags
CREATE TABLE feedback_tags (
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (feedback_id, tag_id)
);

-- Trigger: set updated_at on feedback
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: user can access org if they are an active member
CREATE OR REPLACE FUNCTION user_organization_ids()
RETURNS setof uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid() AND status = 'active';
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_tags ENABLE ROW LEVEL SECURITY;

-- Helper: true if current user is admin of the given org
CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Organizations: only members can read; first-time @vamo user can create one
CREATE POLICY org_select ON organizations
  FOR SELECT USING (id IN (SELECT user_organization_ids()));
CREATE POLICY org_insert ON organizations
  FOR INSERT WITH CHECK (
    is_vamo_user()
    AND NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid())
  );

-- Organization members: only members of same org can read
-- Insert: admin of org can add anyone, OR @vamo user adding themselves to an org that has no members yet (bootstrap)
CREATE POLICY org_members_select ON organization_members
  FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));
CREATE POLICY org_members_insert ON organization_members
  FOR INSERT WITH CHECK (
    is_vamo_user()
    AND (
      (organization_id IN (SELECT user_organization_ids()) AND is_org_admin(organization_id))
      OR
      (user_id = auth.uid() AND NOT EXISTS (
        SELECT 1 FROM organization_members om2
        WHERE om2.organization_id = organization_members.organization_id
      ))
    )
  );
CREATE POLICY org_members_update ON organization_members
  FOR UPDATE USING (organization_id IN (SELECT user_organization_ids()));

-- Invites: members can read; admins can manage
CREATE POLICY invites_select ON invites
  FOR SELECT USING (organization_id IN (SELECT user_organization_ids()));
CREATE POLICY invites_insert ON invites
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT user_organization_ids())
    AND is_vamo_user()
    AND is_org_admin(organization_id)
  );
CREATE POLICY invites_delete ON invites
  FOR DELETE USING (
    organization_id IN (SELECT user_organization_ids())
    AND is_org_admin(organization_id)
  );

-- Tags: read-only for all (global list)
CREATE POLICY tags_select ON tags FOR SELECT USING (true);

-- Customers: org-scoped CRUD
CREATE POLICY customers_all ON customers
  FOR ALL USING (organization_id IN (SELECT user_organization_ids()));

-- Feedback: org-scoped CRUD
CREATE POLICY feedback_all ON feedback
  FOR ALL USING (organization_id IN (SELECT user_organization_ids()));

-- Attachments: via feedback ownership
CREATE POLICY feedback_attachments_all ON feedback_attachments
  FOR ALL USING (
    feedback_id IN (
      SELECT id FROM feedback WHERE organization_id IN (SELECT user_organization_ids())
    )
  );

-- Feedback_tags: via feedback ownership
CREATE POLICY feedback_tags_all ON feedback_tags
  FOR ALL USING (
    feedback_id IN (
      SELECT id FROM feedback WHERE organization_id IN (SELECT user_organization_ids())
    )
  );

-- Storage bucket for feedback attachments (screenshots)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated @vamo users to read/write attachments for their org
-- Path format: {organization_id}/{feedback_id}/{filename}
CREATE POLICY attachments_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) IN (SELECT user_organization_ids()::text)
  );
CREATE POLICY attachments_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND is_vamo_user()
    AND split_part(name, '/', 1) IN (SELECT user_organization_ids()::text)
  );
CREATE POLICY attachments_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND split_part(name, '/', 1) IN (SELECT user_organization_ids()::text)
  );

COMMENT ON TABLE feedback IS 'Customer feedback entries; customer_email NULL means unassigned (tag with Unassigned).';
COMMENT ON TABLE organization_members IS 'Members of an org; status pending = invited but not yet accepted.';
