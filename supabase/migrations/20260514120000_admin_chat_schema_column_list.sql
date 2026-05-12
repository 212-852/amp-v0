-- Introspection for admin chat list: only columns that exist on public.users / public.identities.
-- Called with service role from server code (no arbitrary column names in application SELECT).

CREATE OR REPLACE FUNCTION public.admin_chat_schema_column_list()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'users_columns',
    COALESCE(
      (
        SELECT jsonb_agg(c.column_name ORDER BY c.ordinal_position)
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'users'
      ),
      '[]'::jsonb
    ),
    'identities_columns',
    COALESCE(
      (
        SELECT jsonb_agg(c.column_name ORDER BY c.ordinal_position)
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'identities'
      ),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_chat_schema_column_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_chat_schema_column_list() TO service_role;
