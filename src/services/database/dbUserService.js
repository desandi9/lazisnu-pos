import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

export const mapDbUserToUi = (user) => ({
  id: user.id,
  localId: user.local_id || null,
  name: user.name || user.username || 'Pengguna',
  username: user.username || '',
  password: user.password || '',
  role: user.role || 'admin',
  status: user.status || 'active',
  createdAt: user.created_at || user.createdAt,
  updatedAt: user.updated_at || user.updatedAt
});

const mapUiUserToDb = (user) => ({
  local_id: user.localId || (String(user.id || '').startsWith('U-') ? user.id : null),
  name: user.name || user.username || 'Pengguna',
  username: user.username,
  password: user.password || '',
  role: user.role || 'admin',
  status: user.status || 'active',
  created_at: user.createdAt || new Date().toISOString(),
  updated_at: user.updatedAt || new Date().toISOString()
});

export async function getUsersFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase.from('users').select('*').order('name');
    if (error) throw error;

    return { success: true, data: (data || []).map(mapDbUserToUi) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil data pengguna.' };
  }
}

export async function getUserByUsernameFromDb(username) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', String(username || '').trim().toLowerCase())
      .maybeSingle();

    if (error) throw error;

    return { success: true, data: data ? mapDbUserToUi(data) : null };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil data pengguna.' };
  }
}

export async function createUserInDb(user) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const row = mapUiUserToDb({ ...user, username: String(user.username || '').trim().toLowerCase() });
    const { data, error } = await supabase.from('users').insert(row).select('*').single();
    if (error) throw error;

    return { success: true, data: mapDbUserToUi(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal membuat pengguna.' };
  }
}

export async function updateUserInDb(userId, payload) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const row = {
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.username !== undefined ? { username: String(payload.username).trim().toLowerCase() } : {}),
      ...(payload.password ? { password: payload.password } : {}),
      ...(payload.role !== undefined ? { role: payload.role } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('users').update(row).eq('id', userId).select('*').single();
    if (error) throw error;

    return { success: true, data: mapDbUserToUi(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal memperbarui pengguna.' };
  }
}

export async function setUserStatusInDb(userId, status) {
  return updateUserInDb(userId, { status });
}

export async function deleteUserFromDb(userId) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!isUuid(userId)) return { success: false, status: 'error', error: 'ID pengguna database tidak valid.' };

  try {
    const { data, error } = await supabase.from('users').delete().eq('id', userId).select('id');
    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menghapus pengguna.' };
  }
}

export async function checkUserHasTransactions(user) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const checks = [];

    if (isUuid(user?.id)) {
      checks.push(supabase.from('transactions').select('id').eq('petugas_id', user.id).limit(1));
    }

    if (user?.name) {
      checks.push(supabase.from('transactions').select('id').eq('nama_petugas_snapshot', user.name).limit(1));
    }

    if (checks.length === 0) return { success: true, data: false };

    const results = await Promise.all(checks);
    const errorResult = results.find(result => result.error);
    if (errorResult) throw errorResult.error;

    return { success: true, data: results.some(result => (result.data || []).length > 0) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengecek transaksi pengguna.' };
  }
}

export async function upsertUsersToDb(users) {
  if (!isSupabaseConfigured()) return notConfiguredResult;
  if (!Array.isArray(users) || users.length === 0) return { success: true, data: [] };

  try {
    const rows = users
      .map(user => mapUiUserToDb({ ...user, username: String(user.username || '').trim().toLowerCase() }))
      .filter(row => row.username);

    if (rows.length === 0) return { success: true, data: [] };

    const { data, error } = await supabase
      .from('users')
      .upsert(rows, { onConflict: 'username' })
      .select('*');

    if (error) throw error;

    return { success: true, data: (data || []).map(mapDbUserToUi) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal sinkronisasi pengguna.' };
  }
}

export async function syncUsersCacheFromDb() {
  const result = await getUsersFromDb();

  if (result.success) {
    localStorage.setItem('lazisnu_core_users', JSON.stringify(result.data));
  }

  return result;
}
