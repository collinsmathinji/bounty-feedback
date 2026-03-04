-- Single Vamo organization: only @vamo.app users; one org for the whole app.
-- Signup gives access to this org (handled in app via ensureUserOrganization).

-- Ensure only one organization can exist
CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_key ON organizations (name);

-- Insert the single "Vamo" organization if it doesn't exist
INSERT INTO organizations (name)
VALUES ('Vamo')
ON CONFLICT (name) DO NOTHING;

-- Prevent creating any additional organizations (users and app use this one only)
DROP POLICY IF EXISTS org_insert ON organizations;

-- Optional: block any future insert of a second org (even via service role)
CREATE OR REPLACE FUNCTION prevent_multiple_organizations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM organizations) >= 1 THEN
    RAISE EXCEPTION 'Only one organization (Vamo) is allowed.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_prevent_multiple_organizations ON organizations;
CREATE TRIGGER trigger_prevent_multiple_organizations
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION prevent_multiple_organizations();

COMMENT ON TABLE organizations IS 'Single shared organization (Vamo); only @vamo.app users are members.';
