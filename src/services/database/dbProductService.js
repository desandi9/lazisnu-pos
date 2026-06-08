import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const PRODUCTS_CACHE_KEY = 'lazisnu_core_products';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

export const mapProductFromDb = (row) => ({
  id: row.id,
  localId: row.local_id || null,
  name: row.name || 'Produk',
  category: row.category || '',
  size: row.size || '',
  price: Number(row.price || 0),
  stock: Number(row.stock || 0),
  minStock: Number(row.min_stock || 0),
  isActive: Number(row.stock || 0) > 0 ? (row.is_active ?? true) : false,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null
});

export const mapProductToDb = (product) => {
  const stock = Number(product.stock || 0);

  return {
    ...(product.localId || String(product.id || '').startsWith('P-') ? { local_id: product.localId || product.id } : {}),
    name: product.name || 'Produk',
    category: product.category || null,
    size: product.size || null,
    price: Number(product.price || 0),
    stock,
    min_stock: Number(product.minStock ?? product.min_stock ?? 0),
    is_active: stock > 0 ? (product.isActive ?? product.is_active ?? true) : false,
    created_at: product.createdAt || new Date().toISOString(),
    updated_at: product.updatedAt || new Date().toISOString()
  };
};

export async function getProductsFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase.from('products').select('*').order('category').order('name');
    if (error) throw error;

    return { success: true, data: (data || []).map(mapProductFromDb) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil data produk.' };
  }
}

export async function createProductInDb(product) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const row = mapProductToDb({ localId: `P-${Date.now()}`, ...product });
    const { data, error } = await supabase.from('products').insert(row).select('*').single();
    if (error) throw error;

    return { success: true, data: mapProductFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan produk.' };
  }
}

export async function updateProductInDb(productId, payload) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(productId)) return { success: false, status: 'error', error: 'ID produk database tidak valid.' };

  try {
    const row = {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.category !== undefined ? { category: payload.category || null } : {}),
      ...(payload.size !== undefined ? { size: payload.size || null } : {}),
      ...(payload.price !== undefined ? { price: Number(payload.price || 0) } : {}),
      ...(payload.stock !== undefined ? { stock: Number(payload.stock || 0) } : {}),
      ...(payload.minStock !== undefined || payload.min_stock !== undefined ? { min_stock: Number(payload.minStock ?? payload.min_stock ?? 0) } : {}),
      ...(payload.isActive !== undefined || payload.is_active !== undefined ? { is_active: payload.isActive ?? payload.is_active } : {}),
      updated_at: new Date().toISOString()
    };
    if (row.stock !== undefined && row.stock <= 0) row.is_active = false;
    const { data, error } = await supabase.from('products').update(row).eq('id', productId).select('*').single();
    if (error) throw error;

    return { success: true, data: mapProductFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal memperbarui produk.' };
  }
}

export async function deleteProductFromDb(productId) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(productId)) return { success: false, status: 'error', error: 'ID produk database tidak valid.' };

  try {
    const { data, error } = await supabase.from('products').delete().eq('id', productId).select('id');
    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menghapus produk.' };
  }
}

export async function setProductActiveInDb(productId, isActive) {
  return updateProductInDb(productId, { isActive });
}

export async function updateProductStockInDb(productId, stock) {
  const nextStock = Math.max(0, Number(stock || 0));

  return updateProductInDb(productId, {
    stock: nextStock,
    ...(nextStock <= 0 ? { isActive: false } : {})
  });
}

export async function checkProductHasTransactions(product) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const checks = [];

    if (isUuid(product?.id)) {
      checks.push(supabase.from('transaction_items').select('id').eq('product_id', product.id).limit(1));
    }

    if (product?.name) {
      checks.push(supabase.from('transaction_items').select('id').eq('product_name_snapshot', product.name).limit(1));
    }

    if (checks.length === 0) return { success: true, data: false };

    const results = await Promise.all(checks);
    const errorResult = results.find(result => result.error);
    if (errorResult) throw errorResult.error;

    return { success: true, data: results.some(result => (result.data || []).length > 0) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengecek transaksi produk.' };
  }
}

export async function syncProductsCacheFromDb() {
  const result = await getProductsFromDb();

  if (result.success) {
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(result.data));
  }

  return result;
}

export async function upsertProductsToDb(products) {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
  if (!Array.isArray(products) || products.length === 0) return [];

  const rows = products.map(product => mapProductToDb(product));

  const { data, error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'local_id' })
    .select('*');

  if (error) throw error;
  return data || [];
}
