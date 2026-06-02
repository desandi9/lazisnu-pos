import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const ensureConfigured = () => {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
};

const getTransactionItems = (tx) => {
  if (Array.isArray(tx.items) && tx.items.length > 0) return tx.items;

  return [{
    productId: tx.productId || null,
    productNameSnapshot: tx.productNameSnapshot || tx.productName || '-',
    productCategorySnapshot: tx.productCategorySnapshot || tx.productCategory || '-',
    productSizeSnapshot: tx.productSizeSnapshot || tx.productSize || '-',
    priceSnapshot: tx.priceSnapshot ?? tx.price ?? 0,
    qty: tx.qty || 0,
    subtotal: tx.total || ((tx.priceSnapshot ?? tx.price ?? 0) * (tx.qty || 0))
  }];
};

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
  ensureConfigured();
  const { data, error } = await supabase
    .from('transactions')
    .select('*, transaction_items(*)')
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function upsertTransactionsToDb(transactions) {
  ensureConfigured();
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const { userIdByLocalId } = await getLocalIdMaps();
  const rows = transactions.map(tx => ({
    transaction_number: tx.id,
    date: tx.date || new Date().toISOString(),
    buyer_name: tx.buyerName || 'Hamba Allah',
    petugas_id: userIdByLocalId.get(tx.petugasId) || null,
    nama_petugas_snapshot: tx.namaPetugasSnapshot || '-',
    role_snapshot: tx.roleSnapshot || '-',
    total: Number(tx.total || 0),
    payment_method: tx.paymentMethod || 'Tunai',
    notes: tx.notes || '',
    sync_status: tx.syncStatus || 'pending',
    synced_at: tx.syncedAt || null,
    lazisnu_percent_snapshot: Number(tx.lazisnuPercentSnapshot ?? 30),
    pcnu_percent_snapshot: Number(tx.pcnuPercentSnapshot ?? 30),
    petugas_percent_snapshot: Number(tx.petugasPercentSnapshot ?? 30),
    pengelola_percent_snapshot: Number(tx.pengelolaPercentSnapshot ?? 10),
    lazisnu_amount: Number(tx.lazisnuAmount || 0),
    pcnu_amount: Number(tx.pcnuAmount || 0),
    petugas_amount: Number(tx.petugasAmount || 0),
    pengelola_amount: Number(tx.pengelolaAmount || 0),
    created_at: tx.date || new Date().toISOString(),
    updated_at: tx.syncedAt || new Date().toISOString()
  })).filter(row => row.transaction_number);

  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'transaction_number' })
    .select('*');

  if (error) throw error;
  return data || [];
}

export async function upsertTransactionItemsToDb(transactions) {
  ensureConfigured();
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const transactionNumbers = transactions.map(tx => tx.id).filter(Boolean);
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

  const rows = transactions.flatMap(tx => getTransactionItems(tx).map(item => ({
    transaction_id: txIdByNumber.get(tx.id),
    product_id: productIdByLocalId.get(item.productId) || null,
    product_name_snapshot: item.productNameSnapshot || item.productName || '-',
    product_category_snapshot: item.productCategorySnapshot || item.productCategory || '-',
    product_size_snapshot: item.productSizeSnapshot || item.productSize || '-',
    price_snapshot: Number(item.priceSnapshot ?? item.price ?? 0),
    qty: Number(item.qty || 0),
    subtotal: Number(item.subtotal || 0)
  }))).filter(row => row.transaction_id);

  if (rows.length === 0) return [];

  const { data, error } = await supabase.from('transaction_items').insert(rows).select('*');
  if (error) throw error;
  return data || [];
}
