import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const PROFIT_SETTINGS_CACHE_KEY = 'lazisnu_core_profitSharingSettings';

const DEFAULT_PROFIT_SHARING_SETTINGS = {
  lazisnuPercent: 30,
  pcnuPercent: 30,
  petugasPercent: 30,
  pengelolaPercent: 10,
  updatedAt: new Date().toISOString()
};

const notConfiguredResult = {
  success: false,
  status: 'not_configured',
  error: 'Supabase belum dikonfigurasi.'
};

export const mapProfitSharingFromDb = (row) => ({
  id: row.id,
  lazisnuPercent: Number(row.lazisnu_percent ?? 30),
  pcnuPercent: Number(row.pcnu_percent ?? 30),
  petugasPercent: Number(row.petugas_percent ?? 30),
  pengelolaPercent: Number(row.pengelola_percent ?? 10),
  updatedAt: row.updated_at || new Date().toISOString()
});

export const mapProfitSharingToDb = (settings) => ({
  lazisnu_percent: Number(settings?.lazisnuPercent ?? settings?.lazisnu_percent ?? 30),
  pcnu_percent: Number(settings?.pcnuPercent ?? settings?.pcnu_percent ?? 30),
  petugas_percent: Number(settings?.petugasPercent ?? settings?.petugas_percent ?? 30),
  pengelola_percent: Number(settings?.pengelolaPercent ?? settings?.pengelola_percent ?? 10),
  updated_at: new Date().toISOString()
});

export async function getProfitSharingSettingsFromDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const { data, error } = await supabase
      .from('profit_sharing_settings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return { success: true, data: data ? mapProfitSharingFromDb(data) : null };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal mengambil pengaturan laba.' };
  }
}

export async function upsertProfitSharingSettingsToDb(settings) {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  try {
    const existing = await getProfitSharingSettingsFromDb();
    if (!existing.success) return existing;

    const row = mapProfitSharingToDb(settings);
    const query = existing.data?.id
      ? supabase.from('profit_sharing_settings').update(row).eq('id', existing.data.id)
      : supabase.from('profit_sharing_settings').insert(row);

    const { data, error } = await query.select('*').single();
    if (error) throw error;

    return { success: true, data: mapProfitSharingFromDb(data) };
  } catch (error) {
    return { success: false, status: 'error', error: error.message || 'Gagal menyimpan pengaturan laba.' };
  }
}

export async function ensureDefaultProfitSharingSettingsInDb() {
  if (!isSupabaseConfigured()) return notConfiguredResult;

  const existing = await getProfitSharingSettingsFromDb();
  if (!existing.success) return existing;
  if (existing.data) return existing;

  return upsertProfitSharingSettingsToDb(DEFAULT_PROFIT_SHARING_SETTINGS);
}

export async function syncProfitSharingSettingsCacheFromDb() {
  const ensured = await ensureDefaultProfitSharingSettingsInDb();

  if (ensured.success && ensured.data) {
    localStorage.setItem(PROFIT_SETTINGS_CACHE_KEY, JSON.stringify(ensured.data));
  }

  return ensured;
}
