-- ============================================================================
-- MIGRASI STOCK MOVEMENTS — STIKERNISASI LAZISNU POS
-- ============================================================================
-- Jalankan file ini manual di Supabase SQL Editor setelah stiker-piutang-migration.sql
-- ============================================================================

create table if not exists public.stiker_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  type text not null check (type in ('in', 'lost', 'adjustment')),
  qty integer not null default 0,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now()
);

-- Index untuk lookup per produk
create index if not exists idx_stiker_stock_movements_product_id
  on public.stiker_stock_movements(product_id);

create index if not exists idx_stiker_stock_movements_type
  on public.stiker_stock_movements(type);

-- RLS tetap disabled (sama seperti tabel lain fase 1)
alter table public.stiker_stock_movements disable row level security;

-- ============================================================================
-- FALLBACK DATA:
-- Untuk transaksi lama yang belum punya stock movement,
-- sistem akan menghitung:
--   Masuk = currentStock + (total terjual paid) + (total piutang unpaid) + (total lost)
-- Tidak perlu insert data dummy.
-- ============================================================================
