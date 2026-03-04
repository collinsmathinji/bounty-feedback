-- RLS: only authenticated @vamo.app users can read tags (spec: "only authenticated users with verified @vamo.app can read any data")
DROP POLICY IF EXISTS tags_select ON tags;
CREATE POLICY tags_select ON tags
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND is_vamo_user()
  );

COMMENT ON TABLE tags IS 'Global tag list; readable only by authenticated @vamo.app users.';

-- Storage: attachments bucket – restrict SELECT/DELETE to @vamo.app users (INSERT already had is_vamo_user)
DROP POLICY IF EXISTS attachments_select ON storage.objects;
CREATE POLICY attachments_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND is_vamo_user()
    AND split_part(name, '/', 1) IN (SELECT user_organization_ids()::text)
  );

DROP POLICY IF EXISTS attachments_delete ON storage.objects;
CREATE POLICY attachments_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'attachments'
    AND is_vamo_user()
    AND split_part(name, '/', 1) IN (SELECT user_organization_ids()::text)
  );
