import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const TRANSACTIONS_CACHE_KEY = 'lazisnu_core_transactions';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

const normalizePaymentStatus = (status) => ['paid', 'unpaid', 'partial'].includes(String(status || '').toLowerCase())
  ? String(status || '').toLowerCase()
  : 'paid';

const toSafeNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const getPaymentAmounts = ({ paymentStatus, total, paidAmount, remainingAmount }) => {
  const status = normalizePaymentStatus(paymentStatus);
  const safeTotal = toSafeNumber(total);

  if (status === 'paid') return { paidAmount: safeTotal, remainingAmount: 0 };
  if (status === 'unpaid') return { paidAmount: 0, remainingAmount: safeTotal };

  const safePaidAmount = Math.max(0, toSafeNumber(paidAmount));
  const safeRemainingAmount = remainingAmount !== undefined && remainingAmount !== null
    ? Math.max(0, toSafeNumber(remainingAmount))
    : Math.max(0, safeTotal - safePaidAmount);

  return { paidAmount: safePaidAmount, remainingAmount: safeRemainingAmount };
};

const getTransactionItems = (tx) => {
  if (Array.isArray(tx.items) && tx.items.length > 0) return tx.items;

  return [{
    id: tx.productId || null,
    productId: tx.productId || tx.product_id || null,
    productNameSnapshot: tx.productNameSnapshot || tx.product_name_snapshot || tx.productName || tx.name || '-',
    productCategorySnapshot: tx.productCategorySnapshot || tx.product_category_snapshot || tx.productCategory || tx.category || '-',
    productSizeSnapshot: tx.productSizeSnapshot || tx.product_size_snapshot || tx.productSize || tx.size || '-',
    priceSnapshot: toSafeNumber(tx.priceSnapshot ?? tx.price_snapshot ?? tx.price),
    qty: toSafeNumber(tx.qty || tx.quantity),
    subtotal: toSafeNumber(tx.total || (toSafeNumber(tx.priceSnapshot ?? tx.price_snapshot ?? tx.price) * toSafeNumber(tx.qty || tx.quantity)))
  }];
};

const mapDbItemToUi = (item) => {
  const price = toSafeNumber(item.priceSnapshot ?? item.price_snapshot ?? item.price);
  const qty = toSafeNumber(item.qty || item.quantity);

  return {
    id: item.id || item.dbId || item.productId || item.product_id || null,
    dbId: item.dbId || item.id || null,
    productId: item.productId || item.product_id || null,
    productNameSnapshot: item.productNameSnapshot || item.product_name_snapshot || item.name || item.productName || '-',
    productCategorySnapshot: item.productCategorySnapshot || item.product_category_snapshot || item.category || item.productCategory || '-',
    productSizeSnapshot: item.productSizeSnapshot || item.product_size_snapshot || item.size || item.productSize || '-',
    priceSnapshot: price,
    qty,
    subtotal: toSafeNumber(item.subtotal ?? (price * qty)),
    createdAt: item.createdAt || item.created_at || null
  };
};

export const mapTransactionFromDb = (transactionRow, itemRows = []) => {
  const items = (itemRows || transactionRow.transaction_items || []).map(mapDbItemToUi);
  const firstItem = items[0] || {};
  const paymentStatus = normalizePaymentStatus(transactionRow.payment_status);
  const total = toSafeNumber(transactionRow.total);
  const fallbackAmounts = getPaymentAmounts({ paymentStatus, total });
  const paidAmount = transactionRow.paid_amount !== undefined && transactionRow.paid_amount !== null
    ? toSafeNumber(transactionRow.paid_amount)
    : fallbackAmounts.paidAmount;
  const remainingAmount = transactionRow.remaining_amount !== undefined && transactionRow.remaining_amount !== null
    ? toSafeNumber(transactionRow.remaining_amount)
    : getPaymentAmounts({ paymentStatus, total, paidAmount }).remainingAmount;

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
    qty: items.reduce((sum, item) => sum + toSafeNumber(item.qty), 0),
    items,
    total,
    paymentMethod: transactionRow.payment_method || 'Tunai',
    notes: transactionRow.notes || '',
    syncStatus: transactionRow.sync_status || 'pending',
    syncedAt: transactionRow.synced_at || null,
    lazisnuPercentSnapshot: toSafeNumber(transactionRow.lazisnu_percent_snapshot ?? 30),
    pcnuPercentSnapshot: toSafeNumber(transactionRow.pcnu_percent_snapshot ?? 30),
    petugasPercentSnapshot: toSafeNumber(transactionRow.petugas_percent_snapshot ?? 30),
    pengelolaPercentSnapshot: toSafeNumber(transactionRow.pengelola_percent_snapshot ?? 10),
    lazisnuAmount: toSafeNumber(transactionRow.lazisnu_amount),
    pcnuAmount: toSafeNumber(transactionRow.pcnu_amount),
    petugasAmount: toSafeNumber(transactionRow.petugas_amount),
    pengelolaAmount: toSafeNumber(transactionRow.pengelola_amount),
    createdAt: transactionRow.created_at || null,
    updatedAt: transactionRow.updated_at || null,
    // -- Piutang fields --
    paymentStatus,
    paidAmount,
    remainingAmount,
    debtDueDate: transactionRow.debt_due_date || null,
    debtPaidAt: transactionRow.debt_paid_at || null,
    debtNote: transactionRow.debt_note || null
  };
};

export const mapTransactionToDb = (transaction, userIdByLocalId = new Map()) => {
  const paymentStatus = normalizePaymentStatus(transaction.paymentStatus);
  const total = toSafeNumber(transaction.total);
  const amounts = getPaymentAmounts({
    paymentStatus,
    total,
    paidAmount: transaction.paidAmount,
    remainingAmount: transaction.remainingAmount
  });

  return {
    transaction_number: transaction.transactionNumber || transaction.nomorTransaksi || transaction.id,
    date: transaction.date || new Date().toISOString(),
    buyer_name: transaction.buyerName || 'Hamba Allah',
    petugas_id: isUuid(transaction.petugasId) ? transaction.petugasId : (userIdByLocalId.get(transaction.petugasId) || null),
    nama_petugas_snapshot: transaction.namaPetugasSnapshot || '-',
    role_snapshot: transaction.roleSnapshot || '-',
    total,
    payment_method: transaction.paymentMethod || 'Tunai',
    notes: transaction.notes || '',
    sync_status: transaction.syncStatus || 'pending',
    synced_at: transaction.syncedAt || null,
    lazisnu_percent_snapshot: toSafeNumber(transaction.lazisnuPercentSnapshot ?? 30),
    pcnu_percent_snapshot: toSafeNumber(transaction.pcnuPercentSnapshot ?? 30),
    petugas_percent_snapshot: toSafeNumber(transaction.petugasPercentSnapshot ?? 30),
    pengelola_percent_snapshot: toSafeNumber(transaction.pengelolaPercentSnapshot ?? 10),
    lazisnu_amount: toSafeNumber(transaction.lazisnuAmount),
    pcnu_amount: toSafeNumber(transaction.pcnuAmount),
    petugas_amount: toSafeNumber(transaction.petugasAmount),
    pengelola_amount: toSafeNumber(transaction.pengelolaAmount),
    created_at: transaction.createdAt || transaction.date || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // -- Piutang fields --
    payment_status: paymentStatus,
    paid_amount: amounts.paidAmount,
    remaining_amount: amounts.remainingAmount,
    debt_due_date: paymentStatus === 'unpaid' || paymentStatus === 'partial' ? (transaction.debtDueDate || null) : null,
    debt_paid_at: paymentStatus === 'paid' ? (transaction.debtPaidAt || new Date().toISOString()) : null,
    debt_note: paymentStatus === 'unpaid' || paymentStatus === 'partial' ? (transaction.debtNote || '') : null
  };
};

export const mapTransactionItemToDb = (item, transactionId, productIdByLocalId = new Map()) => ({
  transaction_id: transactionId,
  product_id: isUuid(item.productId || item.product_id || item.id) ? (item.productId || item.product_id || item.id) : (productIdByLocalId.get(item.productId || item.product_id || item.id) || null),
  product_name_snapshot: item.productNameSnapshot || item.product_name_snapshot || item.name || item.productName || '-',
  product_category_snapshot: item.productCategorySnapshot || item.product_category_snapshot || item.category || item.productCategory || '-',
  product_size_snapshot: item.productSizeSnapshot || item.product_size_snapshot || item.size || item.productSize || '-',
  price_snapshot: toSafeNumber(item.priceSnapshot ?? item.price_snapshot ?? item.price),
  qty: toSafeNumber(item.qty || item.quantity),
  subtotal: toSafeNumber(item.subtotal ?? (toSafeNumber(item.priceSnapshot ?? item.price_snapshot ?? item.price) * toSafeNumber(item.qty || item.quantity)))
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
    if (import.meta.env.DEV) console.debug('db payload:', row);
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
      ...(payload.paymentStatus !== undefined || payload.payment_status !== undefined ? { payment_status: normalizePaymentStatus(payload.paymentStatus ?? payload.payment_status) } : {}),
      ...(payload.paidAmount !== undefined || payload.paid_amount !== undefined ? { paid_amount: toSafeNumber(payload.paidAmount ?? payload.paid_amount) } : {}),
      ...(payload.remainingAmount !== undefined || payload.remaining_amount !== undefined ? { remaining_amount: toSafeNumber(payload.remainingAmount ?? payload.remaining_amount) } : {}),
      ...(payload.debtDueDate !== undefined || payload.debt_due_date !== undefined ? { debt_due_date: payload.debtDueDate ?? payload.debt_due_date } : {}),
      ...(payload.debtPaidAt !== undefined || payload.debt_paid_at !== undefined ? { debt_paid_at: payload.debtPaidAt ?? payload.debt_paid_at } : {}),
      ...(payload.debtNote !== undefined || payload.debt_note !== undefined ? { debt_note: payload.debtNote ?? payload.debt_note } : {}),
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
