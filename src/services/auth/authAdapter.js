import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { getUserByUsernameFromDb } from '../database/dbUserService';

export const AUTH_MODES = {
  CUSTOM_USERS: 'custom_users',
  SUPABASE_AUTH: 'supabase_auth'
};

const normalizeAuthMode = (value) => (
  Object.values(AUTH_MODES).includes(value) ? value : AUTH_MODES.CUSTOM_USERS
);

export const AUTH_MODE = normalizeAuthMode(import.meta.env.VITE_AUTH_MODE || AUTH_MODES.CUSTOM_USERS);

const toSafeProfile = (profile) => {
  if (!profile) return null;

  const safeProfile = { ...profile };
  delete safeProfile.password;

  return safeProfile;
};

export const getCurrentAuthMode = () => AUTH_MODE;

export async function loginWithCustomUsers(username, password) {
  const result = await getUserByUsernameFromDb(username);
  if (!result.success) throw new Error(result.error || 'Gagal membaca user dari database.');

  const profile = result.data;
  if (!profile || profile.password !== password) throw new Error('Username atau password salah.');
  if (profile.status !== 'active') throw new Error('Akun tidak aktif.');

  return toSafeProfile(profile);
}

export async function loginWithSupabaseAuth(emailOrUsername, password) {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(emailOrUsername || '').trim(),
    password
  });

  if (error) throw error;

  const profileResult = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error('Profile pengguna tidak ditemukan.');

  return mapAuthUserToProfile(data.user, profileResult.data);
}

export function mapAuthUserToProfile(authUser, profile) {
  return toSafeProfile({
    ...profile,
    id: profile?.id,
    authUserId: authUser?.id || profile?.auth_user_id || null,
    email: authUser?.email || profile?.email || '',
    username: profile?.username || authUser?.email || '',
    role: profile?.role || 'admin',
    status: profile?.status || 'inactive'
  });
}

export async function validateSessionWithCurrentMode(currentUser) {
  if (!currentUser?.id || !currentUser?.username || !currentUser?.role) return null;

  if (AUTH_MODE === AUTH_MODES.CUSTOM_USERS) return toSafeProfile(currentUser);
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const profileResult = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (profileResult.error || !profileResult.data || profileResult.data.status !== 'active') return null;

  return mapAuthUserToProfile(data.user, profileResult.data);
}
