import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export async function checkDatabaseConnection() {
  if (!isSupabaseConfigured()) {
    return {
      status: 'not_configured',
      message: 'Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.'
    };
  }

  try {
    const { error } = await supabase.from('app_settings').select('key').limit(1);

    if (error) throw error;

    return { status: 'connected', message: 'Database terhubung.' };
  } catch (error) {
    return { status: 'error', message: error.message || 'Gagal terhubung ke database.' };
  }
}
