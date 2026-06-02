import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { upsertUsersToDb } from './dbUserService';
import { upsertProductsToDb } from './dbProductService';
import { upsertTransactionsToDb, upsertTransactionItemsToDb } from './dbTransactionService';
import { upsertProfitSharingSettingsToDb } from './dbProfitSharingService';

export async function migrateLocalDataToSupabase(localData) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase belum dikonfigurasi.');
  }

  const summary = {
    users: 0,
    products: 0,
    transactions: 0,
    transactionItems: 0,
    profitSharingSettings: 0
  };

  const users = await upsertUsersToDb(localData.users || []);
  if (!users.success) throw new Error(users.error || 'Migrasi pengguna gagal.');
  summary.users = users.data.length;

  const products = await upsertProductsToDb(localData.products || []);
  summary.products = products.length;

  const settings = await upsertProfitSharingSettingsToDb(localData.profitSharingSettings || {});
  summary.profitSharingSettings = settings ? 1 : 0;

  const transactions = await upsertTransactionsToDb(localData.transactions || []);
  summary.transactions = transactions.length;

  const items = await upsertTransactionItemsToDb(localData.transactions || []);
  summary.transactionItems = items.length;

  await supabase.from('sync_logs').insert({
    type: 'local_to_supabase_migration',
    status: 'success',
    message: 'Migrasi data lokal ke Supabase berhasil.',
    metadata: summary
  });

  return summary;
}
