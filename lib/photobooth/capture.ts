import type { ValidPhotoCount } from '@/types';

/**
 * Phase 4 — penyimpanan foto hasil capture (client-side).
 *
 * Foto disimpan sebagai JPEG dataURL (string) dalam sessionStorage
 * dengan key `lumia_captured_photos` — format yang sama dengan desain
 * HTML (`lumia design/take_foto.html`), siap dipakai Phase 5 (Review).
 * Urutan = urutan pengambilan; jumlah tidak boleh melebihi pilihan.
 * Tidak ada upload ke server pada phase ini.
 */

const PHOTOS_KEY = 'lumia_captured_photos';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isPhotoDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

export function getCapturedPhotos(): string[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(PHOTOS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPhotoDataUrl);
  } catch {
    return [];
  }
}

function persist(photos: string[]): boolean {
  try {
    storage()?.setItem(PHOTOS_KEY, JSON.stringify(photos));
    return true;
  } catch {
    // Kuota penuh / storage tidak tersedia: jangan lempar agar
    // kamera tidak macet; penelepon menangani nilai false.
    return false;
  }
}

/** Menambah satu foto; false bila kuota penuh atau simpan gagal. */
export function addCapturedPhoto(photo: string, max: ValidPhotoCount): boolean {
  if (!isPhotoDataUrl(photo)) return false;
  const current = getCapturedPhotos();
  if (current.length >= max) return false;
  return persist([...current, photo]);
}

export function clearCapturedPhotos(): void {
  try {
    storage()?.removeItem(PHOTOS_KEY);
  } catch {
    /* abaikan — session opsional */
  }
}
