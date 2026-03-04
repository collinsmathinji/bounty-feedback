-- Profiles: store email and name for display (synced from auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_org ON profiles
  FOR SELECT USING (
    id IN (
      SELECT user_id FROM organization_members
      WHERE organization_id IN (SELECT user_organization_ids())
    )
    OR id = auth.uid()
  );

CREATE POLICY profiles_insert_self ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Sync from auth.users (run as postgres or with trigger on auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger requires Supabase dashboard or migration with auth schema permission
-- Alternatively, sync on first login in app (e.g. ensureUserOrganization also upsert profile)
COMMENT ON TABLE profiles IS 'User profile (email, name) for display; sync from auth on signup or first load.';
