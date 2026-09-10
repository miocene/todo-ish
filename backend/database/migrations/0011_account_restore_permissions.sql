-- Account restore replaces obsolete personal color keys. Migration 0008 already
-- enforces colors.user_id = current_setting('app.user_id') with forced RLS.
-- This grants no access to another account's colors or to household resources.
GRANT DELETE ON TABLE "colors" TO "todo_runtime";
