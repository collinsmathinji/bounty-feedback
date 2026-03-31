-- Add Reports tag for report-generation feedback suggestions.
INSERT INTO tags (name, slug)
VALUES ('Reports', 'reports')
ON CONFLICT (name) DO NOTHING;
