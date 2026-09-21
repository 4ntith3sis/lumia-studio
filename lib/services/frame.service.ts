import { getSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Frame, Profile, ValidPhotoCount, FrameInsert } from '@/types';

/**
 * Client-safe service layer (boleh diimpor dari 'use client').
 * - TIDAK mengimpor lib/supabase/server.ts (tidak ada service role di browser).
 * - Semua operasi memakai authenticated anon client + session user.
 * - Penegakan akses utama ada di RLS Postgres; guard is_admin di sini
 *   hanya untuk UX (pesan error lebih jelas sebelum request ditolak RLS).
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
    throw new Error('Akses ditolak. Hanya admin yang dapat mengelola frame.');
  }
  return sb;
}

/* ─── Frame Service ─────────────────────────────────────── */

export async function getFramesByPhotoCount(count: ValidPhotoCount): Promise<Frame[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('frames')
    .select('*')
    .eq('is_active', true)
    .eq('photo_count', count)
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch frames: ${error.message}`);
  return (data ?? []) as Frame[];
}

export async function getAllFrames(): Promise<Frame[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('frames')
    .select('*')
    .order('photo_count', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch all frames: ${error.message}`);
  return (data ?? []) as Frame[];
}

export async function getFrameById(id: string): Promise<Frame | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('frames')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to fetch frame: ${error.message}`);
  return data as Frame | null;
}

/* ─── Admin Frame Operations (RLS-enforced, admin-only) ─── */

export async function createFrame(input: FrameInsert): Promise<Frame> {
  const supabase = await requireAdminClient();
  const { data, error } = await supabase.from('frames').insert(input).select().single();

  if (error) throw new Error(`Failed to create frame: ${error.message}`);
  return data as Frame;
}

export async function updateFrame(
  id: string,
  updates: Partial<FrameInsert & { is_active?: boolean }>
): Promise<Frame> {
  const supabase = await requireAdminClient();
  const { data, error } = await supabase
    .from('frames')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update frame: ${error.message}`);
  return data as Frame;
}

export interface DeleteFrameResult {
  /** False bila record terhapus tetapi file Storage gagal dibersihkan. */
  storageCleaned: boolean;
}

export async function deleteFrame(id: string): Promise<DeleteFrameResult> {
  const supabase = await requireAdminClient();
  const { data: frame, error: fetchError } = await supabase
    .from('frames')
    .select('image_url')
    .eq('id', id)
    .single();

  if (fetchError) throw new Error(`Frame not found: ${fetchError.message}`);

  const { error: deleteError } = await supabase.from('frames').delete().eq('id', id);
  if (deleteError) throw new Error(`Failed to delete frame: ${deleteError.message}`);

  // Bersihkan file Storage milik frame ini saja. Kegagalan cleanup
  // tidak membatalkan penghapusan record, tetapi dilaporkan.
  let storageCleaned = true;
  if (frame?.image_url) {
    const path = extractStoragePath(frame.image_url);
    if (path) {
      try {
        const { error: removeError } = await supabase.storage.from('frame-images').remove([path]);
        if (removeError) storageCleaned = false;
      } catch {
        storageCleaned = false;
      }
    }
  }
  return { storageCleaned };
}

export async function toggleFrameActive(id: string, isActive: boolean): Promise<Frame> {
  return updateFrame(id, { is_active: isActive });
}

/* ─── Storage Upload ────────────────────────────────────── */

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function uploadFrameImage(file: File): Promise<string> {
  if (file.type !== 'image/png') {
    throw new Error('Hanya file PNG yang diperbolehkan.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Ukuran file maksimal 5 MB.');
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `frames/${timestamp}_${safeName}`;

  const supabase = await requireAdminClient();
  const { error: uploadError } = await supabase.storage
    .from('frame-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw new Error(`Upload gagal: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from('frame-images').getPublicUrl(path);
  return urlData?.publicUrl ?? '';
}

function extractStoragePath(imageUrl: string): string | null {
  try {
    const u = new URL(imageUrl);
    const parts = u.pathname.split('/');
    const bucketIdx = parts.indexOf('frame-images');
    if (bucketIdx === -1 || bucketIdx + 1 >= parts.length) return null;
    const path = parts.slice(bucketIdx + 1).join('/');
    // Hanya path file di dalam bucket frame-images; tolak traversal
    // agar tidak menyentuh file lain.
    if (!path || path.includes('..')) return null;
    return path;
  } catch {
    // URL relatif (asset lokal) atau eksternal: bukan file Storage.
    return null;
  }
}

/* ─── Auth / Profile ────────────────────────────────────── */

export async function getProfile(): Promise<Profile | null> {
  const supabase = requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }
  return data as Profile | null;
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.is_admin === true;
}
