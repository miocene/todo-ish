DO $$
DECLARE
  account_id text;
BEGIN
  SELECT id INTO account_id FROM auth_users WHERE username = 'vadik';
  IF account_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.user_id', account_id, true);

  INSERT INTO app_data_revisions (scope, resource, revision)
  VALUES (account_id, 'preferences', 1)
  ON CONFLICT (scope, resource) DO UPDATE
  SET revision = app_data_revisions.revision + 1,
      updated_at = now();

  INSERT INTO user_preferences (user_id, hidden_navigation)
  VALUES (account_id, ARRAY['printing', 'cross-stitch', 'catalog']::text[])
  ON CONFLICT (user_id) DO UPDATE
  SET hidden_navigation = ARRAY(
    SELECT DISTINCT item
    FROM unnest(user_preferences.hidden_navigation || EXCLUDED.hidden_navigation) AS items(item)
    ORDER BY item
  );
END
$$;
