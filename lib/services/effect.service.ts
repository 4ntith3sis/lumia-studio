import { getSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Effect, EffectInsert, EffectSettings } from '@/types';
import { mergeEffectSettings, validateEffectSettings } from '@/lib/photobooth/effect-utils';

/**
 * Client-safe service layer (boleh diimpor dari 'use client').
 * Semua operasi memakai authenticated anon client + session user.
 * Penegakan akses utama ada di RLS Postgres.
 */

function requireClient(): SupabaseClient {
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error('Konfigurasi Supabase belum tersedia. Hubungi administrator.');
  }
  return sb;
}

async function requireAdminClient(): Promise<SupabaseClient> {
  const sb = requireClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    throw new Error('Akses ditolak. Silakan masuk sebagai admin.');
  }
  const { data: profile, error } = await sb
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (error || !profile?.is_admin) {
    throw new Error('Akses ditolak. Hanya admin yang dapat mengelola efek.');
  }
  return sb;
}

/** Sanitasi respons database: pastikan settings selalu ada & valid. */
function sanitizeEffect(raw: Record<string, unknown>): Effect {
  return {
    ...raw,
    settings: mergeEffectSettings(raw.settings),
  } as Effect;
}

/* ─── Public (Studio / user) ─────────────────────────────── */

export async function getActiveEffects(): Promise<Effect[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('effects')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch effects: ${error.message}`);
  return (data ?? []).map(sanitizeEffect);
}

/* ─── Admin CRUD ─────────────────────────────────────────── */

export async function getAllEffects(): Promise<Effect[]> {
  const supabase = await requireAdminClient();
  const { data, error } = await supabase
    .from('effects')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch effects: ${error.message}`);
  return (data ?? []).map(sanitizeEffect);
}

export async function getEffectById(id: string): Promise<Effect | null> {
  const supabase = await requireAdminClient();
  const { data, error } = await supabase
    .from('effects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to fetch effect: ${error.message}`);
  return data ? sanitizeEffect(data) : null;
}

export async function createEffect(input: EffectInsert): Promise<Effect> {
  const supabase = await requireAdminClient();
  const settings = input.settings ?? validateEffectSettings({});
  const { data, error } = await supabase
    .from('effects')
    .insert({
      ...input,
      settings,
      filter_id: input.filter_id ?? 'custom',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create effect: ${error.message}`);
  return sanitizeEffect(data);
}

export async function updateEffect(
  id: string,
  updates: Partial<EffectInsert & { is_active?: boolean }>
): Promise<Effect> {
  const supabase = await requireAdminClient();
  const settings = updates.settings ? validateEffectSettings(updates.settings) : undefined;
  const { data, error } = await supabase
    .from('effects')
    .update({
      ...updates,
      ...(settings ? { settings } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update effect: ${error.message}`);
  return sanitizeEffect(data);
}

export async function deleteEffect(id: string): Promise<void> {
  const supabase = await requireAdminClient();
  const { error } = await supabase.from('effects').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete effect: ${error.message}`);
}

export async function toggleEffectActive(id: string, isActive: boolean): Promise<Effect> {
  return updateEffect(id, { is_active: isActive });
}
