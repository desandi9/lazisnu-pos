import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const STOCK_MOVEMENTS_CACHE_KEY = 'lazisnu_core_stikerStockMovements';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

export const mapStockMovementFromDb = (row) => ({
  id: row.id,
  productId: row.product_id || null,
  type: row.type,
  qty: Number(row.qty || 0),
  note: row.note || '',
  createdBy: row.created_by || null,
  createdByName: row.created_by_name || '',
  createdAt: row.created_at || null
});

export const mapStockMovementToDb = (movement) => ({
  product_id: isUuid(movement.productId || movement.product_id) ? (movement.productId || movement.product_id) : null,
  type: movement.type,
  qty: Math.max(0, Number(movement.qty || 0)),
  note: movement.note || null,
  created_by: isUuid(movement.createdBy || movement.created_by) ? (movement.createdBy || movement.created_by) : null,
  created_by_name: movement.createdByName || movement.created_by_name || null,
  created_at: movement.createdAt || movement.created_at || new Date().toISOString()
});

export async function getStikerStockMovementsFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('stiker_stock_movements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: (data || []).map(mapStockMovementFromDb) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil data movement stok.' };
  }
}

export async function createStikerStockMovementInDb(movement) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('stiker_stock_movements')
      .insert(mapStockMovementToDb(movement))
      .select('*')
      .single();

    if (error) throw error;

    return { success: true, data: mapStockMovementFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan movement stok.' };
  }
}

export async function syncStikerStockMovementsCacheFromDb() {
  const result = await getStikerStockMovementsFromDb();

  if (result.success) {
    localStorage.setItem(STOCK_MOVEMENTS_CACHE_KEY, JSON.stringify(result.data));
  }

  return result;
}
