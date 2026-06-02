import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

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
