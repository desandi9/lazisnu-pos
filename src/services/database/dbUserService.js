import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const ensureConfigured = () => {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
};

export async function getUsersFromDb() {
  ensureConfigured();
  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertUsersToDb(users) {
  ensureConfigured();
  if (!Array.isArray(users) || users.length === 0) return [];

  const rows = users.map(user => ({
    local_id: user.id || null,
    name: user.name || user.username || 'Pengguna',
    username: user.username,
    password: user.password || '',
    role: user.role || 'admin',
    status: user.status || 'active',
    created_at: user.createdAt || new Date().toISOString(),
    updated_at: user.updatedAt || new Date().toISOString()
  })).filter(row => row.username);

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'username' })
    .select('*');

  if (error) throw error;
  return data || [];
}
