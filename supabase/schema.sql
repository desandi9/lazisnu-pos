-- LAZISNU POS - Supabase Database Phase 1
-- Phase 1: MVP internal testing foundation and localStorage migration.
-- Phase 2: wajib pindah ke Supabase Auth + RLS policy per role.
-- Jangan gunakan service role key di frontend.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,
  name text not null,
  username text unique not null,
  password text not null,
  role text not null check (role in ('owner','admin')),
  status text not null check (status in ('active','inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,
  name text not null,
  category text,
  size text,
  price numeric not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text unique not null,
  date timestamptz not null,
  buyer_name text,
  petugas_id uuid references public.users(id) on delete set null,
  nama_petugas_snapshot text,
  role_snapshot text,
  total numeric not null default 0,
  payment_method text,
  notes text,
  sync_status text default 'pending',
  synced_at timestamptz,
  lazisnu_percent_snapshot numeric default 30,
  pcnu_percent_snapshot numeric default 30,
  petugas_percent_snapshot numeric default 30,
  pengelola_percent_snapshot numeric default 10,
  lazisnu_amount numeric default 0,
  pcnu_amount numeric default 0,
  petugas_amount numeric default 0,
  pengelola_amount numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text,
  product_category_snapshot text,
  product_size_snapshot text,
  price_snapshot numeric not null default 0,
  qty integer not null default 1,
  subtotal numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.profit_sharing_settings (
  id uuid primary key default gen_random_uuid(),
  lazisnu_percent numeric not null default 30,
  pcnu_percent numeric not null default 30,
  petugas_percent numeric not null default 30,
  pengelola_percent numeric not null default 10,
  updated_at timestamptz default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  type text,
  status text,
  message text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_transactions_transaction_number on public.transactions(transaction_number);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_transactions_petugas_id on public.transactions(petugas_id);
create index if not exists idx_transaction_items_transaction_id on public.transaction_items(transaction_id);
create index if not exists idx_products_category on public.products(category);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

-- RLS Phase 1:
-- Untuk MVP internal testing, RLS belum diaktifkan agar anon key bisa dipakai oleh service foundation.
-- Phase 2 wajib mengaktifkan RLS, Supabase Auth, dan policy per role.
alter table public.users disable row level security;
alter table public.products disable row level security;
alter table public.transactions disable row level security;
alter table public.transaction_items disable row level security;
alter table public.profit_sharing_settings disable row level security;
alter table public.app_settings disable row level security;
alter table public.sync_logs disable row level security;

insert into public.app_settings (key, value)
values ('schema_version', '{"version":"phase_1"}'::jsonb)
on conflict (key) do update set value = excluded.value;
