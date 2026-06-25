-- ============================================================================
-- MIGRASI PIUTANG / UTANG PEMBELI — STIKERNISASI LAZISNU POS
-- ============================================================================
-- Jalankan file ini manual di Supabase SQL Editor.
-- Jangan jalankan otomatis di aplikasi.
-- ============================================================================

-- 1. Tambah kolom piutang ke tabel transactions
alter table public.transactions
  add column if not exists payment_status text not null default 'paid',
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists remaining_amount numeric not null default 0,
  add column if not exists debt_due_date timestamptz,
  add column if not exists debt_paid_at timestamptz,
  add column if not exists debt_note text;

-- 2. Check constraint untuk validasi nilai payment_status
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'check_payment_status'
    and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint check_payment_status
      check (payment_status in ('paid', 'unpaid', 'partial'));
  end if;
end $$;

-- 3. Index untuk performa query piutang
create index if not exists idx_transactions_payment_status
  on public.transactions(payment_status);

create index if not exists idx_transactions_debt_due_date
  on public.transactions(debt_due_date);

-- ============================================================================
-- CATATAN:
-- 1. Transaksi lama (sebelum migrasi) otomatis:
--    - payment_status = 'paid'
--    - paid_amount = total
--    - remaining_amount = 0
--    Karena default value sudah di set di atas.
-- 2. Jika ada transaksi dengan payment_status NULL karena kolom baru,
--    jalankan query ini:
--    update public.transactions
--    set payment_status = 'paid',
--        paid_amount = total,
--        remaining_amount = 0
--    where payment_status is null;
-- ============================================================================
