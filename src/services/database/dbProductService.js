import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const ensureConfigured = () => {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
};

export async function getProductsFromDb() {
  ensureConfigured();
  const { data, error } = await supabase.from('products').select('*').order('category').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertProductsToDb(products) {
  ensureConfigured();
  if (!Array.isArray(products) || products.length === 0) return [];

  const rows = products.map(product => ({
    local_id: product.id || null,
    name: product.name || 'Produk',
    category: product.category || null,
    size: product.size || null,
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    min_stock: Number(product.minStock || product.min_stock || 0),
    is_active: product.isActive ?? product.is_active ?? true,
    created_at: product.createdAt || new Date().toISOString(),
    updated_at: product.updatedAt || new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('products')
    .upsert(rows, { onConflict: 'local_id' })
    .select('*');

  if (error) throw error;
  return data || [];
}
