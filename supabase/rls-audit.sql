-- Penvoria Supabase RLS diagnostic (READ ONLY).
-- Run in Supabase Dashboard > SQL Editor on the correct Penvoria project.
-- It reads schema metadata, never user financial records.
-- DO NOT paste user financial rows, credentials, or private keys into GitHub.

-- 1. Confirm both tables are present, with RLS enabled,
--    and inspect privileges for signed-out and signed-in roles.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_can_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_can_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_can_update,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_can_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_can_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_can_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_can_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('monthly_budgets', 'recurring_templates')
  and c.relkind in ('r','p')
order by c.relname;

-- 2. Inspect every configured policy, including broad/public policies.
--    Expected owner rules should be scoped to authenticated users,
--    and use auth.uid() = user_id for SELECT, INSERT, UPDATE and DELETE.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('monthly_budgets','recurring_templates')
order by tablename, policyname;

-- 3. Confirm the owner column is present, non-null, and UUID typed.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('monthly_budgets','recurring_templates')
  and column_name in ('user_id', 'revision', 'month')
order by table_name, column_name;

-- 4. Inspect existing indexes without accessing financial data.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('monthly_budgets','recurring_templates')
order by tablename, indexname;

-- This script DOES NOT prove isolation on its own.
-- Follow up with functional RLS tests as anon, user A and user B:
-- each role must be unable to read or modify another user's records.
-- Do not create/alter/drop policies until the current schema is reviewed.
