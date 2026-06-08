-- LAZISNU POS - LPNU Peci Finance Migration Draft
-- Draft only. Do not run automatically.
-- Run after reviewing current lpnu_products data and backing up Supabase.

alter table public.lpnu_products
add column if not exists supplier_share numeric default 0,
add column if not exists lpnu_share numeric default 0,
add column if not exists pcnu_share numeric default 0,
add column if not exists lazisnu_share numeric default 0,
add column if not exists lazisnu_infaq_percent numeric default 50;

-- Recommended default for existing Peci products.
update public.lpnu_products
set
  supplier_share = case when supplier_share = 0 then coalesce(cost_price, 40000) else supplier_share end,
  lpnu_share = case when lpnu_share = 0 then 2500 else lpnu_share end,
  pcnu_share = case when pcnu_share = 0 then 2500 else pcnu_share end,
  lazisnu_share = case when lazisnu_share = 0 then 2500 else lazisnu_share end,
  lazisnu_infaq_percent = case when lazisnu_infaq_percent is null then 50 else lazisnu_infaq_percent end,
  updated_at = now()
where lower(coalesce(category, '')) = 'peci'
   or lower(coalesce(name, '')) like '%peci%';

-- Validation query after migration:
-- select name, selling_price, supplier_share, lpnu_share, pcnu_share, lazisnu_share,
--        supplier_share + lpnu_share + pcnu_share + lazisnu_share as total_pembagian,
--        selling_price - (supplier_share + lpnu_share + pcnu_share + lazisnu_share) as sisa_pengelola
-- from public.lpnu_products
-- order by name;
