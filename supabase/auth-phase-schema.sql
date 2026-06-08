-- LAZISNU POS - Supabase Auth Preparation Schema Draft
-- Draft only. Do not run automatically.
-- This prepares public.users as a profile table for Supabase Auth.
-- Do not drop the password column in this phase.

alter table public.users
add column if not exists auth_user_id uuid unique;

create index if not exists idx_users_auth_user_id
on public.users(auth_user_id);

-- After Supabase Auth accounts exist, auth_user_id should reference auth.users(id).
-- Add the foreign key only after all existing profiles are mapped and tested:
-- alter table public.users
-- add constraint users_auth_user_id_fkey
-- foreign key (auth_user_id) references auth.users(id) on delete set null;

-- Optional future profile fields if login method requires them:
-- alter table public.users add column if not exists email text unique;
-- alter table public.users add column if not exists phone text unique;

-- Migration reminder:
-- 1. Create Supabase Auth accounts for owner/admin.
-- 2. Update public.users.auth_user_id with auth.users.id.
-- 3. Switch VITE_AUTH_MODE to supabase_auth only after testing.
-- 4. Remove custom password usage in a later phase.
-- 5. Enable RLS after all active users have auth_user_id.
