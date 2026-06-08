import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const LPNU_PRODUCTS_CACHE_KEY = 'lazisnu_core_lpnuProducts';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

export const isLpnuProductDbId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ''));

const isMissingPeciFinanceColumnError = (error) => /supplier_share|lpnu_share|pcnu_share|lazisnu_share|lazisnu_infaq_percent/i.test(error?.message || '');

const omitPeciFinanceColumns = (row) => {
  const nextRow = { ...row };
  delete nextRow.supplier_share;
  delete nextRow.lpnu_share;
  delete nextRow.pcnu_share;
  delete nextRow.lazisnu_share;
  delete nextRow.lazisnu_infaq_percent;

  return nextRow;
};

const logLpnuProductDbError = (action, error, payload) => {
  console.error(`LPNU product ${action} failed`, {
    message: error?.message || null,
    details: error?.details || null,
    hint: error?.hint || null,
    code: error?.code || null,
    payload
  });
};

export const mapLpnuProductFromDb = (row) => ({
  id: row.id,
  name: row.name || 'Produk LPNU',
  category: row.category || '',
  unit: row.unit || '',
  costPrice: Number(row.cost_price || 0),
  sellingPrice: Number(row.selling_price || 0),
  supplierShare: Number(row.supplier_share ?? row.cost_price ?? 0),
  lpnuShare: Number(row.lpnu_share ?? 2500),
  pcnuShare: Number(row.pcnu_share ?? 2500),
  lazisnuShare: Number(row.lazisnu_share ?? 2500),
  lazisnuInfaqPercent: Number(row.lazisnu_infaq_percent ?? 50),
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
    supplier_share: Number(product.supplierShare ?? product.supplier_share ?? product.costPrice ?? product.cost_price ?? 0),
    lpnu_share: Number(product.lpnuShare ?? product.lpnu_share ?? 2500),
    pcnu_share: Number(product.pcnuShare ?? product.pcnu_share ?? 2500),
    lazisnu_share: Number(product.lazisnuShare ?? product.lazisnu_share ?? 2500),
    lazisnu_infaq_percent: Number(product.lazisnuInfaqPercent ?? product.lazisnu_infaq_percent ?? 50),
    stock,
    min_stock: Number(product.minStock ?? product.min_stock ?? 0),
    supplier: product.supplier || null,
    is_active: stock > 0 ? (product.isActive ?? product.is_active ?? true) : false
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
    let payload = { ...row };
    let { data, error } = await supabase.from('lpnu_products').insert(payload).select('*').single();
    if (error && isMissingPeciFinanceColumnError(error)) {
      payload = omitPeciFinanceColumns(row);
      ({ data, error } = await supabase.from('lpnu_products').insert(payload).select('*').single());
    }
    if (error) {
      logLpnuProductDbError('insert', error, payload);
      throw error;
    }

    return { success: true, data: mapLpnuProductFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan produk LPNU.' };
  }
}

export async function updateLpnuProductInDb(productId, updates) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isLpnuProductDbId(productId)) return { success: false, status: 'error', error: 'ID produk LPNU database tidak valid.' };

  try {
    const row = {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.category !== undefined ? { category: updates.category || null } : {}),
      ...(updates.unit !== undefined ? { unit: updates.unit || null } : {}),
      ...(updates.costPrice !== undefined || updates.cost_price !== undefined ? { cost_price: Number(updates.costPrice ?? updates.cost_price ?? 0) } : {}),
      ...(updates.sellingPrice !== undefined || updates.selling_price !== undefined ? { selling_price: Number(updates.sellingPrice ?? updates.selling_price ?? 0) } : {}),
      ...(updates.supplierShare !== undefined || updates.supplier_share !== undefined ? { supplier_share: Number(updates.supplierShare ?? updates.supplier_share ?? 0) } : {}),
      ...(updates.lpnuShare !== undefined || updates.lpnu_share !== undefined ? { lpnu_share: Number(updates.lpnuShare ?? updates.lpnu_share ?? 0) } : {}),
      ...(updates.pcnuShare !== undefined || updates.pcnu_share !== undefined ? { pcnu_share: Number(updates.pcnuShare ?? updates.pcnu_share ?? 0) } : {}),
      ...(updates.lazisnuShare !== undefined || updates.lazisnu_share !== undefined ? { lazisnu_share: Number(updates.lazisnuShare ?? updates.lazisnu_share ?? 0) } : {}),
      ...(updates.lazisnuInfaqPercent !== undefined || updates.lazisnu_infaq_percent !== undefined ? { lazisnu_infaq_percent: Number(updates.lazisnuInfaqPercent ?? updates.lazisnu_infaq_percent ?? 50) } : {}),
      ...(updates.stock !== undefined ? { stock: Math.max(0, Number(updates.stock || 0)) } : {}),
      ...(updates.minStock !== undefined || updates.min_stock !== undefined ? { min_stock: Number(updates.minStock ?? updates.min_stock ?? 0) } : {}),
      ...(updates.supplier !== undefined ? { supplier: updates.supplier || null } : {}),
      ...(updates.isActive !== undefined || updates.is_active !== undefined ? { is_active: updates.isActive ?? updates.is_active } : {})
    };
    if (row.stock !== undefined && row.stock <= 0) row.is_active = false;

    let payload = { ...row };
    let { data, error } = await supabase.from('lpnu_products').update(payload).eq('id', productId).select('*').single();
    if (error && isMissingPeciFinanceColumnError(error)) {
      payload = omitPeciFinanceColumns(row);
      ({ data, error } = await supabase.from('lpnu_products').update(payload).eq('id', productId).select('*').single());
    }
    if (error) {
      logLpnuProductDbError('update', error, payload);
      throw error;
    }

    return { success: true, data: mapLpnuProductFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal memperbarui produk LPNU.' };
  }
}

export async function deleteLpnuProductFromDb(productId) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isLpnuProductDbId(productId)) return { success: false, status: 'error', error: 'ID produk LPNU database tidak valid.' };

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
    if (!isLpnuProductDbId(product?.id)) return { success: true, data: false };

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
