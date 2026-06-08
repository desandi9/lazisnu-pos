-- LAZISNU POS - LPNU Module Schema Draft
-- Draft only. Do not run automatically.
-- This schema is separate from Stikernisasi tables.

create table if not exists public.lpnu_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  unit text,
  cost_price numeric default 0,
  selling_price numeric default 0,
  stock integer default 0,
  min_stock integer default 0,
  supplier text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lpnu_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text unique not null,
  date timestamptz not null,
  buyer_name text,
  petugas_id uuid,
  nama_petugas_snapshot text,
  total_modal numeric default 0,
  total_jual numeric default 0,
  laba_kotor numeric default 0,
  biaya_operasional numeric default 0,
  laba_bersih numeric default 0,
  payment_method text,
  notes text,
  sync_status text default 'pending',
  synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lpnu_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.lpnu_transactions(id) on delete cascade,
  product_id uuid,
  product_name_snapshot text,
  category_snapshot text,
  unit_snapshot text,
  cost_price_snapshot numeric default 0,
  selling_price_snapshot numeric default 0,
  qty integer default 1,
  subtotal_modal numeric default 0,
  subtotal_jual numeric default 0,
  margin numeric default 0,
  created_at timestamptz default now()
);

create index if not exists idx_lpnu_products_name on public.lpnu_products(name);
create index if not exists idx_lpnu_products_category on public.lpnu_products(category);
create index if not exists idx_lpnu_products_is_active on public.lpnu_products(is_active);
create index if not exists idx_lpnu_transactions_transaction_number on public.lpnu_transactions(transaction_number);
create index if not exists idx_lpnu_transactions_date on public.lpnu_transactions(date);
create index if not exists idx_lpnu_transactions_petugas_id on public.lpnu_transactions(petugas_id);
create index if not exists idx_lpnu_transaction_items_transaction_id on public.lpnu_transaction_items(transaction_id);
create index if not exists idx_lpnu_transaction_items_product_id on public.lpnu_transaction_items(product_id);

drop trigger if exists set_lpnu_products_updated_at on public.lpnu_products;
create trigger set_lpnu_products_updated_at before update on public.lpnu_products for each row execute function public.set_updated_at();

drop trigger if exists set_lpnu_transactions_updated_at on public.lpnu_transactions;
create trigger set_lpnu_transactions_updated_at before update on public.lpnu_transactions for each row execute function public.set_updated_at();

-- RLS for LPNU should be added only after Supabase Auth/RLS migration is active.
-- Keep this module isolated from existing Stikernisasi products/transactions tables.
