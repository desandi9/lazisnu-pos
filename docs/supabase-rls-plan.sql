-- LAZISNU POS - Supabase RLS Plan Draft
-- Draft only. Do not run in production before Supabase Auth is connected.
-- This plan requires public.users.auth_user_id to reference auth.users(id).
-- Do not apply while the app still authenticates only with the MVP custom users table.

-- Recommended profile binding for the next auth phase:
-- alter table public.users add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- Helper functions for policies after Supabase Auth migration.
create or replace function public.current_profile()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.current_profile()
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'owner'
$$;

create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('owner', 'admin')
$$;

-- Enable RLS after auth.uid() is connected to public.users.auth_user_id.
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.profit_sharing_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.sync_logs enable row level security;

-- Users
drop policy if exists "owner can read users" on public.users;
create policy "owner can read users"
on public.users for select
using (public.is_owner());

drop policy if exists "user can read own profile" on public.users;
create policy "user can read own profile"
on public.users for select
using (auth_user_id = auth.uid());

drop policy if exists "owner can insert users" on public.users;
create policy "owner can insert users"
on public.users for insert
with check (public.is_owner());

drop policy if exists "owner can update users" on public.users;
create policy "owner can update users"
on public.users for update
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "owner can delete users" on public.users;
create policy "owner can delete users"
on public.users for delete
using (public.is_owner() and auth_user_id is distinct from auth.uid());

-- Products
drop policy if exists "owner admin can read products" on public.products;
create policy "owner admin can read products"
on public.products for select
using (public.is_admin_or_owner());

drop policy if exists "owner can insert products" on public.products;
create policy "owner can insert products"
on public.products for insert
with check (public.is_owner());

drop policy if exists "owner can update products" on public.products;
create policy "owner can update products"
on public.products for update
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "owner can delete products" on public.products;
create policy "owner can delete products"
on public.products for delete
using (public.is_owner());

-- Transactions
drop policy if exists "owner admin can read transactions" on public.transactions;
create policy "owner admin can read transactions"
on public.transactions for select
using (public.is_admin_or_owner());

-- Alternative stricter admin read policy if needed later:
-- using (public.is_owner() or petugas_id = (select id from public.current_profile()))

drop policy if exists "owner admin can create transactions" on public.transactions;
create policy "owner admin can create transactions"
on public.transactions for insert
with check (public.is_admin_or_owner());

drop policy if exists "owner admin can update sync status" on public.transactions;
create policy "owner admin can update sync status"
on public.transactions for update
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

-- Transaction items
drop policy if exists "owner admin can read transaction items" on public.transaction_items;
create policy "owner admin can read transaction items"
on public.transaction_items for select
using (public.is_admin_or_owner());

drop policy if exists "owner admin can insert transaction items" on public.transaction_items;
create policy "owner admin can insert transaction items"
on public.transaction_items for insert
with check (public.is_admin_or_owner());

drop policy if exists "owner can rewrite transaction items" on public.transaction_items;
create policy "owner can rewrite transaction items"
on public.transaction_items for delete
using (public.is_owner());

-- Profit sharing settings
drop policy if exists "owner admin can read profit settings" on public.profit_sharing_settings;
create policy "owner admin can read profit settings"
on public.profit_sharing_settings for select
using (public.is_admin_or_owner());

drop policy if exists "owner can manage profit settings" on public.profit_sharing_settings;
create policy "owner can manage profit settings"
on public.profit_sharing_settings for all
using (public.is_owner())
with check (public.is_owner());

-- App settings
drop policy if exists "owner admin can read app settings" on public.app_settings;
create policy "owner admin can read app settings"
on public.app_settings for select
using (public.is_admin_or_owner());

drop policy if exists "owner can manage app settings" on public.app_settings;
create policy "owner can manage app settings"
on public.app_settings for all
using (public.is_owner())
with check (public.is_owner());

-- Sync logs
drop policy if exists "owner admin can read sync logs" on public.sync_logs;
create policy "owner admin can read sync logs"
on public.sync_logs for select
using (public.is_admin_or_owner());

drop policy if exists "owner admin can insert sync logs" on public.sync_logs;
create policy "owner admin can insert sync logs"
on public.sync_logs for insert
with check (public.is_admin_or_owner());

-- After applying RLS, test these flows before deploy:
-- owner login, admin login, owner user management, owner product management,
-- admin transaction creation, reports, spreadsheet sync, import products, PWA reload.
