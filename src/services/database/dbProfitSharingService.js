import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const ensureConfigured = () => {
  if (!isSupabaseConfigured()) throw new Error('Supabase belum dikonfigurasi.');
};

export async function getProfitSharingSettingsFromDb() {
  ensureConfigured();
  const { data, error } = await supabase
    .from('profit_sharing_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertProfitSharingSettingsToDb(settings) {
  ensureConfigured();

  const row = {
    lazisnu_percent: Number(settings?.lazisnuPercent ?? settings?.lazisnu_percent ?? 30),
    pcnu_percent: Number(settings?.pcnuPercent ?? settings?.pcnu_percent ?? 30),
    petugas_percent: Number(settings?.petugasPercent ?? settings?.petugas_percent ?? 30),
    pengelola_percent: Number(settings?.pengelolaPercent ?? settings?.pengelola_percent ?? 10),
    updated_at: settings?.updatedAt || settings?.updated_at || new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('profit_sharing_settings')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
