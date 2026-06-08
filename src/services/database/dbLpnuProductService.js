import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const LPNU_PRODUCTS_CACHE_KEY = 'lazisnu_core_lpnuProducts';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ''));

export const mapLpnuProductFromDb = (row) => ({
  id: row.id,
  name: row.name || 'Produk LPNU',
  category: row.category || '',
  unit: row.unit || '',
  costPrice: Number(row.cost_price || 0),
  sellingPrice: Number(row.selling_price || 0),
  stock: Number(row.stock || 0),
  minStock: Number(row.min_stock || 0),
  supplier: row.supplier || '',
  isActive: Number(row.stock || 0) > 0 ? (row.is_active ?? true) : false,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null
});

export const mapLpnuProductToDb = (product) => {
  const stock = Math.max(0, Number(product.stock || 0));

  return {
    name: product.name || 'Produk LPNU',
    category: product.category || null,
    unit: product.unit || null,
    cost_price: Number(product.costPrice ?? product.cost_price ?? 0),
    selling_price: Number(product.sellingPrice ?? product.selling_price ?? 0),
    stock,
    min_stock: Number(product.minStock ?? product.min_stock ?? 0),
    supplier: product.supplier || null,
    is_active: stock > 0 ? (product.isActive ?? product.is_active ?? true) : false,
    created_at: product.createdAt || new Date().toISOString(),
    updated_at: product.updatedAt || new Date().toISOString()
  };
};

export async function getLpnuProductsFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase.from('lpnu_products').select('*').order('name');
    if (error) throw error;

    return { success: true, data: (data || []).map(mapLpnuProductFromDb) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil produk LPNU.' };
  }
}

export async function createLpnuProductInDb(product) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const row = mapLpnuProductToDb(product);
    const { data, error } = await supabase.from('lpnu_products').insert(row).select('*').single();
    if (error) throw error;

    return { success: true, data: mapLpnuProductFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan produk LPNU.' };
  }
}

export async function updateLpnuProductInDb(productId, payload) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(productId)) return { success: false, status: 'error', error: 'ID produk LPNU database tidak valid.' };

  try {
    const row = {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.category !== undefined ? { category: payload.category || null } : {}),
      ...(payload.unit !== undefined ? { unit: payload.unit || null } : {}),
      ...(payload.costPrice !== undefined || payload.cost_price !== undefined ? { cost_price: Number(payload.costPrice ?? payload.cost_price ?? 0) } : {}),
      ...(payload.sellingPrice !== undefined || payload.selling_price !== undefined ? { selling_price: Number(payload.sellingPrice ?? payload.selling_price ?? 0) } : {}),
      ...(payload.stock !== undefined ? { stock: Math.max(0, Number(payload.stock || 0)) } : {}),
      ...(payload.minStock !== undefined || payload.min_stock !== undefined ? { min_stock: Number(payload.minStock ?? payload.min_stock ?? 0) } : {}),
      ...(payload.supplier !== undefined ? { supplier: payload.supplier || null } : {}),
      ...(payload.isActive !== undefined || payload.is_active !== undefined ? { is_active: payload.isActive ?? payload.is_active } : {}),
      updated_at: new Date().toISOString()
    };
    if (row.stock !== undefined && row.stock <= 0) row.is_active = false;

    const { data, error } = await supabase.from('lpnu_products').update(row).eq('id', productId).select('*').single();
    if (error) throw error;

    return { success: true, data: mapLpnuProductFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal memperbarui produk LPNU.' };
  }
}

export async function deleteLpnuProductFromDb(productId) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(productId)) return { success: false, status: 'error', error: 'ID produk LPNU database tidak valid.' };

  try {
    const { data, error } = await supabase.from('lpnu_products').delete().eq('id', productId).select('id');
    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menghapus produk LPNU.' };
  }
}

export async function setLpnuProductActiveInDb(productId, isActive) {
  return updateLpnuProductInDb(productId, { isActive });
}

export async function updateLpnuProductStockInDb(productId, stock) {
  const nextStock = Math.max(0, Number(stock || 0));

  return updateLpnuProductInDb(productId, {
    stock: nextStock,
    ...(nextStock <= 0 ? { isActive: false } : {})
  });
}

export async function checkLpnuProductHasTransactions(product) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    if (!isUuid(product?.id)) return { success: true, data: false };

    const { data, error } = await supabase
      .from('lpnu_transaction_items')
      .select('id')
      .eq('product_id', product.id)
      .limit(1);

    if (error) throw error;

    return { success: true, data: (data || []).length > 0 };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengecek transaksi produk LPNU.' };
  }
}

export async function syncLpnuProductsCacheFromDb() {
  const result = await getLpnuProductsFromDb();

  if (result.success) {
    localStorage.setItem(LPNU_PRODUCTS_CACHE_KEY, JSON.stringify(result.data));
  }

  return result;
}
