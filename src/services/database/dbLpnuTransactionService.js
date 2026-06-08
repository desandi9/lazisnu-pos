import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { isLpnuProductDbId } from './dbLpnuProductService';

const LPNU_TRANSACTIONS_CACHE_KEY = 'lazisnu_core_lpnuTransactions';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ''));

const numberValue = (value) => Number(value || 0);

const getLpnuTransactionItems = (transaction) => Array.isArray(transaction?.items) ? transaction.items : [];

export const mapLpnuTransactionItemFromDb = (row) => ({
  id: row.id,
  productId: row.product_id || null,
  productNameSnapshot: row.product_name_snapshot || '-',
  categorySnapshot: row.category_snapshot || '-',
  unitSnapshot: row.unit_snapshot || '-',
  costPriceSnapshot: numberValue(row.cost_price_snapshot),
  sellingPriceSnapshot: numberValue(row.selling_price_snapshot),
  qty: numberValue(row.qty),
  subtotalModal: numberValue(row.subtotal_modal),
  subtotalJual: numberValue(row.subtotal_jual),
  margin: numberValue(row.margin),
  createdAt: row.created_at || null
});

export const mapLpnuTransactionFromDb = (row, itemRows = []) => {
  const items = (itemRows || row.lpnu_transaction_items || []).map(mapLpnuTransactionItemFromDb);
  const totalModal = numberValue(row.total_modal);
  const totalJual = numberValue(row.total_jual);
  const biayaOperasional = numberValue(row.biaya_operasional);
  const labaKotor = numberValue(row.laba_kotor || (totalJual - totalModal));
  const labaBersih = numberValue(row.laba_bersih || (labaKotor - biayaOperasional));

  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    date: row.date,
    buyerName: row.buyer_name || 'Hamba Allah',
    petugasId: row.petugas_id || null,
    namaPetugasSnapshot: row.nama_petugas_snapshot || '-',
    totalModal,
    totalJual,
    labaKotor,
    biayaOperasional,
    labaBersih,
    totalQty: items.reduce((sum, item) => sum + numberValue(item.qty), 0),
    items,
    paymentMethod: row.payment_method || 'Tunai',
    notes: row.notes || '',
    syncStatus: row.sync_status || 'pending',
    syncedAt: row.synced_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
};

export const mapLpnuTransactionToDb = (transaction) => ({
  transaction_number: transaction.transactionNumber,
  date: transaction.date || new Date().toISOString(),
  buyer_name: transaction.buyerName || 'Hamba Allah',
  petugas_id: isUuid(transaction.petugasId) ? transaction.petugasId : null,
  nama_petugas_snapshot: transaction.namaPetugasSnapshot || '-',
  total_modal: numberValue(transaction.totalModal),
  total_jual: numberValue(transaction.totalJual),
  laba_kotor: numberValue(transaction.labaKotor),
  biaya_operasional: numberValue(transaction.biayaOperasional),
  laba_bersih: numberValue(transaction.labaBersih),
  payment_method: transaction.paymentMethod || 'Tunai',
  notes: transaction.notes || null,
  sync_status: transaction.syncStatus || 'pending',
  synced_at: transaction.syncedAt || null
});

export const mapLpnuTransactionItemToDb = (item, transactionId) => ({
  transaction_id: transactionId,
  product_id: isLpnuProductDbId(item.productId) ? item.productId : null,
  product_name_snapshot: item.productNameSnapshot || '-',
  category_snapshot: item.categorySnapshot || 'LPNU',
  unit_snapshot: item.unitSnapshot || '-',
  cost_price_snapshot: numberValue(item.costPriceSnapshot),
  selling_price_snapshot: numberValue(item.sellingPriceSnapshot),
  qty: numberValue(item.qty),
  subtotal_modal: numberValue(item.subtotalModal),
  subtotal_jual: numberValue(item.subtotalJual),
  margin: numberValue(item.margin)
});

const groupItemsByTransactionId = (items = []) => items.reduce((acc, item) => {
  const key = item.transaction_id;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

export async function getLpnuTransactionsFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const [{ data: transactions, error: txError }, { data: items, error: itemError }] = await Promise.all([
      supabase.from('lpnu_transactions').select('*').order('date', { ascending: false }),
      supabase.from('lpnu_transaction_items').select('*').order('created_at')
    ]);

    if (txError) throw txError;
    if (itemError) throw itemError;

    const groupedItems = groupItemsByTransactionId(items || []);

    return { success: true, data: (transactions || []).map(tx => mapLpnuTransactionFromDb(tx, groupedItems[tx.id] || [])) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil transaksi LPNU.' };
  }
}

export async function getLpnuTransactionByIdFromDb(id) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const query = supabase.from('lpnu_transactions').select('*, lpnu_transaction_items(*)');
    const { data, error } = isUuid(id)
      ? await query.eq('id', id).maybeSingle()
      : await query.eq('transaction_number', id).maybeSingle();

    if (error) throw error;

    return { success: true, data: data ? mapLpnuTransactionFromDb(data) : null };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil transaksi LPNU.' };
  }
}

export async function getLpnuTransactionByNumberFromDb(transactionNumber) {
  return getLpnuTransactionByIdFromDb(transactionNumber);
}

export async function checkLpnuTransactionExistsByNumber(transactionNumber) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('lpnu_transactions')
      .select('id')
      .eq('transaction_number', transactionNumber)
      .maybeSingle();

    if (error) throw error;

    return { success: true, data: Boolean(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengecek nomor transaksi LPNU.' };
  }
}

export async function createLpnuTransactionItemsInDb(transactionId, items) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(transactionId)) return { success: false, status: 'error', error: 'ID transaksi LPNU database tidak valid.' };
  if (!Array.isArray(items) || items.length === 0) return { success: true, data: [] };

  try {
    const rows = items.map(item => mapLpnuTransactionItemToDb(item, transactionId));
    const { data, error } = await supabase.from('lpnu_transaction_items').insert(rows).select('*');
    if (error) throw error;

    return { success: true, data: (data || []).map(mapLpnuTransactionItemFromDb) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan item transaksi LPNU.' };
  }
}

export async function createLpnuTransactionInDb(transaction) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const row = mapLpnuTransactionToDb(transaction);
    const { data, error } = await supabase.from('lpnu_transactions').insert(row).select('*').single();
    if (error) throw error;

    const itemsResult = await createLpnuTransactionItemsInDb(data.id, getLpnuTransactionItems(transaction));
    if (!itemsResult.success) {
      await supabase.from('lpnu_transactions').delete().eq('id', data.id);
      throw new Error(itemsResult.error || 'Gagal menyimpan item transaksi LPNU.');
    }

    return { success: true, data: mapLpnuTransactionFromDb(data, itemsResult.data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan transaksi LPNU.' };
  }
}

export async function updateLpnuTransactionSyncStatusInDb(transactionId, syncStatus, syncedAt = null) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const query = supabase
      .from('lpnu_transactions')
      .update({ sync_status: syncStatus, synced_at: syncedAt })
      .select('*, lpnu_transaction_items(*)');
    const { data, error } = isUuid(transactionId)
      ? await query.eq('id', transactionId).single()
      : await query.eq('transaction_number', transactionId).single();

    if (error) throw error;

    return { success: true, data: mapLpnuTransactionFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal memperbarui status sync transaksi LPNU.' };
  }
}

export async function syncLpnuTransactionsCacheFromDb() {
  const result = await getLpnuTransactionsFromDb();

  if (result.success) {
    localStorage.setItem(LPNU_TRANSACTIONS_CACHE_KEY, JSON.stringify(result.data));
  }

  return result;
}
