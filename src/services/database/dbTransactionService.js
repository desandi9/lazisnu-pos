import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const TRANSACTIONS_CACHE_KEY = 'lazisnu_core_transactions';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

const getTransactionItems = (tx) => {
  if (Array.isArray(tx.items) && tx.items.length > 0) return tx.items;

  return [{
    id: tx.productId || null,
    productId: tx.productId || tx.product_id || null,
    productNameSnapshot: tx.productNameSnapshot || tx.product_name_snapshot || tx.productName || tx.name || '-',
    productCategorySnapshot: tx.productCategorySnapshot || tx.product_category_snapshot || tx.productCategory || tx.category || '-',
    productSizeSnapshot: tx.productSizeSnapshot || tx.product_size_snapshot || tx.productSize || tx.size || '-',
    priceSnapshot: Number(tx.priceSnapshot ?? tx.price_snapshot ?? tx.price ?? 0),
    qty: Number(tx.qty || tx.quantity || 0),
    subtotal: Number(tx.total || ((tx.priceSnapshot ?? tx.price_snapshot ?? tx.price ?? 0) * (tx.qty || tx.quantity || 0)))
  }];
};

const mapDbItemToUi = (item) => {
  const price = Number(item.priceSnapshot ?? item.price_snapshot ?? item.price ?? 0);
  const qty = Number(item.qty || item.quantity || 0);

  return {
    id: item.id || item.dbId || item.productId || item.product_id || null,
    dbId: item.dbId || item.id || null,
    productId: item.productId || item.product_id || null,
    productNameSnapshot: item.productNameSnapshot || item.product_name_snapshot || item.name || item.productName || '-',
    productCategorySnapshot: item.productCategorySnapshot || item.product_category_snapshot || item.category || item.productCategory || '-',
    productSizeSnapshot: item.productSizeSnapshot || item.product_size_snapshot || item.size || item.productSize || '-',
    priceSnapshot: price,
    qty,
    subtotal: Number(item.subtotal ?? (price * qty)),
    createdAt: item.createdAt || item.created_at || null
  };
};

export const mapTransactionFromDb = (transactionRow, itemRows = []) => {
  const items = (itemRows || transactionRow.transaction_items || []).map(mapDbItemToUi);
  const firstItem = items[0] || {};

  return {
    dbId: transactionRow.id,
    id: transactionRow.transaction_number,
    transactionNumber: transactionRow.transaction_number,
    nomorTransaksi: transactionRow.transaction_number,
    date: transactionRow.date,
    buyerName: transactionRow.buyer_name || 'Hamba Allah',
    petugasId: transactionRow.petugas_id || null,
    namaPetugasSnapshot: transactionRow.nama_petugas_snapshot || '-',
    roleSnapshot: transactionRow.role_snapshot || '-',
    productId: firstItem.productId || null,
    productName: firstItem.productNameSnapshot || '-',
    productNameSnapshot: firstItem.productNameSnapshot || '-',
    productCategorySnapshot: firstItem.productCategorySnapshot || '-',
    productSizeSnapshot: firstItem.productSizeSnapshot || '-',
    price: firstItem.priceSnapshot || 0,
    priceSnapshot: firstItem.priceSnapshot || 0,
    qty: items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    items,
    total: Number(transactionRow.total || 0),
    paymentMethod: transactionRow.payment_method || 'Tunai',
    notes: transactionRow.notes || '',
    syncStatus: transactionRow.sync_status || 'pending',
    syncedAt: transactionRow.synced_at || null,
    lazisnuPercentSnapshot: Number(transactionRow.lazisnu_percent_snapshot ?? 30),
    pcnuPercentSnapshot: Number(transactionRow.pcnu_percent_snapshot ?? 30),
    petugasPercentSnapshot: Number(transactionRow.petugas_percent_snapshot ?? 30),
    pengelolaPercentSnapshot: Number(transactionRow.pengelola_percent_snapshot ?? 10),
    lazisnuAmount: Number(transactionRow.lazisnu_amount || 0),
    pcnuAmount: Number(transactionRow.pcnu_amount || 0),
    petugasAmount: Number(transactionRow.petugas_amount || 0),
    pengelolaAmount: Number(transactionRow.pengelola_amount || 0),
    createdAt: transactionRow.created_at || null,
    updatedAt: transactionRow.updated_at || null
  };
};

export const mapTransactionToDb = (transaction, userIdByLocalId = new Map()) => ({
  transaction_number: transaction.transactionNumber || transaction.nomorTransaksi || transaction.id,
  date: transaction.date || new Date().toISOString(),
  buyer_name: transaction.buyerName || 'Hamba Allah',
  petugas_id: isUuid(transaction.petugasId) ? transaction.petugasId : (userIdByLocalId.get(transaction.petugasId) || null),
  nama_petugas_snapshot: transaction.namaPetugasSnapshot || '-',
  role_snapshot: transaction.roleSnapshot || '-',
  total: Number(transaction.total || 0),
  payment_method: transaction.paymentMethod || 'Tunai',
  notes: transaction.notes || '',
  sync_status: transaction.syncStatus || 'pending',
  synced_at: transaction.syncedAt || null,
  lazisnu_percent_snapshot: Number(transaction.lazisnuPercentSnapshot ?? 30),
  pcnu_percent_snapshot: Number(transaction.pcnuPercentSnapshot ?? 30),
  petugas_percent_snapshot: Number(transaction.petugasPercentSnapshot ?? 30),
  pengelola_percent_snapshot: Number(transaction.pengelolaPercentSnapshot ?? 10),
  lazisnu_amount: Number(transaction.lazisnuAmount || 0),
  pcnu_amount: Number(transaction.pcnuAmount || 0),
  petugas_amount: Number(transaction.petugasAmount || 0),
  pengelola_amount: Number(transaction.pengelolaAmount || 0),
  created_at: transaction.createdAt || transaction.date || new Date().toISOString(),
  updated_at: new Date().toISOString()
});

export const mapTransactionItemToDb = (item, transactionId, productIdByLocalId = new Map()) => ({
  transaction_id: transactionId,
  product_id: isUuid(item.productId || item.product_id || item.id) ? (item.productId || item.product_id || item.id) : (productIdByLocalId.get(item.productId || item.product_id || item.id) || null),
  product_name_snapshot: item.productNameSnapshot || item.product_name_snapshot || item.name || item.productName || '-',
  product_category_snapshot: item.productCategorySnapshot || item.product_category_snapshot || item.category || item.productCategory || '-',
  product_size_snapshot: item.productSizeSnapshot || item.product_size_snapshot || item.size || item.productSize || '-',
  price_snapshot: Number(item.priceSnapshot ?? item.price_snapshot ?? item.price ?? 0),
  qty: Number(item.qty || item.quantity || 0),
  subtotal: Number(item.subtotal ?? ((item.priceSnapshot ?? item.price_snapshot ?? item.price ?? 0) * (item.qty || item.quantity || 0)))
});

export const mapTransactionToUiCache = (transaction) => ({ ...transaction });

async function getLocalIdMaps() {
  const [{ data: users, error: userError }, { data: products, error: productError }] = await Promise.all([
    supabase.from('users').select('id, local_id'),
    supabase.from('products').select('id, local_id')
  ]);

  if (userError) throw userError;
  if (productError) throw productError;

  return {
    userIdByLocalId: new Map((users || []).filter(row => row.local_id).map(row => [row.local_id, row.id])),
    productIdByLocalId: new Map((products || []).filter(row => row.local_id).map(row => [row.local_id, row.id]))
  };
}

export async function getTransactionsFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const [{ data: transactions, error: txError }, { data: items, error: itemError }] = await Promise.all([
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('transaction_items').select('*').order('created_at')
    ]);

    if (txError) throw txError;
    if (itemError) throw itemError;

    const groupedItems = (items || []).reduce((acc, item) => {
      const key = item.transaction_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    return { success: true, data: (transactions || []).map(tx => mapTransactionFromDb(tx, groupedItems[tx.id] || [])) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil data transaksi.' };
  }
}

export async function getTransactionByIdFromDb(id) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const query = supabase.from('transactions').select('*, transaction_items(*)');
    const { data, error } = isUuid(id)
      ? await query.eq('id', id).maybeSingle()
      : await query.eq('transaction_number', id).maybeSingle();

    if (error) throw error;

    return { success: true, data: data ? mapTransactionFromDb(data) : null };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil transaksi.' };
  }
}

export async function getTransactionByNumberFromDb(transactionNumber) {
  return getTransactionByIdFromDb(transactionNumber);
}

export async function checkTransactionExistsByNumber(transactionNumber) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('id')
      .eq('transaction_number', transactionNumber)
      .maybeSingle();

    if (error) throw error;

    return { success: true, data: Boolean(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengecek nomor transaksi.' };
  }
}

export async function createTransactionItemsInDb(transactionId, items) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(transactionId)) return { success: false, status: 'error', error: 'ID transaksi database tidak valid.' };
  if (!Array.isArray(items) || items.length === 0) return { success: true, data: [] };

  try {
    const { productIdByLocalId } = await getLocalIdMaps();
    const rows = items.map(item => mapTransactionItemToDb(item, transactionId, productIdByLocalId));
    const { data, error } = await supabase.from('transaction_items').insert(rows).select('*');
    if (error) throw error;

    return { success: true, data: (data || []).map(mapDbItemToUi) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan item transaksi.' };
  }
}

export async function createTransactionInDb(transaction) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { userIdByLocalId } = await getLocalIdMaps();
    const row = mapTransactionToDb(transaction, userIdByLocalId);
    const { data, error } = await supabase.from('transactions').insert(row).select('*').single();
    if (error) throw error;

    const itemsResult = await createTransactionItemsInDb(data.id, getTransactionItems(transaction));
    if (!itemsResult.success) throw new Error(itemsResult.error || 'Gagal menyimpan item transaksi.');

    return { success: true, data: mapTransactionFromDb(data, itemsResult.data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan transaksi.' };
  }
}

export async function updateTransactionInDb(transactionId, payload) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const row = {
      ...(payload.syncStatus !== undefined || payload.sync_status !== undefined ? { sync_status: payload.syncStatus ?? payload.sync_status } : {}),
      ...(payload.syncedAt !== undefined || payload.synced_at !== undefined ? { synced_at: payload.syncedAt ?? payload.synced_at } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      updated_at: new Date().toISOString()
    };

    const query = supabase.from('transactions').update(row).select('*, transaction_items(*)');
    const { data, error } = isUuid(transactionId)
      ? await query.eq('id', transactionId).single()
      : await query.eq('transaction_number', transactionId).single();

    if (error) throw error;

    return { success: true, data: mapTransactionFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal memperbarui transaksi.' };
  }
}

export async function updateTransactionSyncStatusInDb(transactionId, syncStatus, syncedAt) {
  return updateTransactionInDb(transactionId, { syncStatus, syncedAt });
}

export async function getTransactionItemsFromDb(transactionId) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('transaction_items')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at');

    if (error) throw error;

    return { success: true, data: (data || []).map(mapDbItemToUi) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil item transaksi.' };
  }
}

export async function syncTransactionsCacheFromDb() {
  const result = await getTransactionsFromDb();

  if (result.success) {
    localStorage.setItem(TRANSACTIONS_CACHE_KEY, JSON.stringify(result.data.map(mapTransactionToUiCache)));
  }

  return result;
}

export async function upsertTransactionsToDb(transactions) {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const { userIdByLocalId } = await getLocalIdMaps();
  const rows = transactions
    .map(tx => mapTransactionToDb(tx, userIdByLocalId))
    .filter(row => row.transaction_number);

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'transaction_number' })
    .select('*');

  if (error) throw error;
  return data || [];
}

export async function upsertTransactionItemsToDb(transactions) {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const transactionNumbers = transactions.map(tx => tx.transactionNumber || tx.nomorTransaksi || tx.id).filter(Boolean);
  if (transactionNumbers.length === 0) return [];

  const [{ data: dbTransactions, error: txError }, { productIdByLocalId }] = await Promise.all([
    supabase.from('transactions').select('id, transaction_number').in('transaction_number', transactionNumbers),
    getLocalIdMaps()
  ]);

  if (txError) throw txError;

  const txIdByNumber = new Map((dbTransactions || []).map(row => [row.transaction_number, row.id]));
  const transactionIds = [...txIdByNumber.values()];

  if (transactionIds.length > 0) {
    const { error: deleteError } = await supabase.from('transaction_items').delete().in('transaction_id', transactionIds);
    if (deleteError) throw deleteError;
  }

  const rows = transactions.flatMap(tx => {
    const number = tx.transactionNumber || tx.nomorTransaksi || tx.id;
    return getTransactionItems(tx).map(item => mapTransactionItemToDb(item, txIdByNumber.get(number), productIdByLocalId));
  }).filter(row => row.transaction_id);

  if (rows.length === 0) return [];

  const { data, error } = await supabase.from('transaction_items').insert(rows).select('*');
  if (error) throw error;
  return data || [];
}
