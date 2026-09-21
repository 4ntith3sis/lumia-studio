import type { Frame, ValidPhotoCount } from '@/types';
import { clearCapturedPhotos } from '@/lib/photobooth/capture';
import { clearStudioConfig } from '@/lib/photobooth/studio';

/**
 * Phase 3 — session publik photobooth (client-side).
 *
 * Mengikuti desain HTML (`lumia design/*.html`): state sesi memakai
 * sessionStorage (scope per tab — cocok untuk kiosk photobooth),
 * BUKAN localStorage. Setiap baca selalu divalidasi ulang; nilai di
 * luar 2/3/4/6 atau bentuk frame yang rusak dianggap tidak ada.
 */

export const VALID_PHOTO_COUNTS: readonly ValidPhotoCount[] = [2, 3, 4, 6];

const COUNT_KEY = 'lumia_photo_count';
const FRAME_KEY = 'lumia_frame';
const FILTER_KEY = 'lumia_filter_id';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isValidPhotoCount(value: unknown): value is ValidPhotoCount {
  return (
    typeof value === 'number' &&
    (VALID_PHOTO_COUNTS as readonly number[]).includes(value)
  );
}

export function parsePhotoCount(raw: string | null | undefined): ValidPhotoCount | null {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(raw, 10);
  return isValidPhotoCount(n) ? n : null;
}

export function getPhotoCount(): ValidPhotoCount | null {
  const s = storage();
  if (!s) return null;
  try {
    return parsePhotoCount(s.getItem(COUNT_KEY));
  } catch {
    return null;
  }
}

export function setPhotoCount(count: ValidPhotoCount): void {
  if (!isValidPhotoCount(count)) {
    throw new Error('Jumlah foto tidak valid. Pilih 2, 3, 4, atau 6.');
  }
  storage()?.setItem(COUNT_KEY, String(count));
}

export interface SelectedFrame {
  frame_id: string;
  photo_count: ValidPhotoCount;
  image_url: string;
  name: string;
}

export function getSelectedFrame(): SelectedFrame | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(FRAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SelectedFrame>;
    if (typeof parsed.frame_id !== 'string' || parsed.frame_id === '') return null;
    if (!isValidPhotoCount(parsed.photo_count)) return null;
    if (typeof parsed.image_url !== 'string' || parsed.image_url === '') return null;
    return {
      frame_id: parsed.frame_id,
      photo_count: parsed.photo_count,
      image_url: parsed.image_url,
      name: typeof parsed.name === 'string' ? parsed.name : '',
    };
  } catch {
    return null;
  }
}

export function setSelectedFrame(frame: SelectedFrame): void {
  if (!frame.frame_id || !isValidPhotoCount(frame.photo_count) || !frame.image_url) {
    throw new Error('Data frame tidak valid.');
  }
  storage()?.setItem(FRAME_KEY, JSON.stringify(frame));
}

export function frameToSelection(frame: Frame): SelectedFrame {
  return {
    frame_id: frame.id,
    photo_count: frame.photo_count,
    image_url: frame.image_url,
    name: frame.name,
  };
}

export function clearSelectedFrame(): void {
  try {
    storage()?.removeItem(FRAME_KEY);
  } catch {
    /* abaikan — session opsional */
  }
}

/* ─── Filter efek (id lokal dari daftar FILTERS Studio, bukan database) ─── */

export function getSelectedFilterId(): string | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(FILTER_KEY);
    return raw && raw !== '' ? raw : null;
  } catch {
    return null;
  }
}

export function setSelectedFilterId(id: string): void {
  if (!id) throw new Error('ID filter tidak valid.');
  storage()?.setItem(FILTER_KEY, id);
}

/* ─── Reset sesi terpusat ─── */

function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* abaikan — session opsional */
  }
}

/**
 * Hapus data hasil sesi berjalan (foto, konfigurasi studio, frame,
 * filter) — dipakai saat memulai alur baru, refresh kamera, atau
 * "Ulang Foto". Idempoten dan aman dipanggil berulang (Strict Mode).
 * photo_count sengaja dipertahankan (ditulis ulang saat konfirmasi).
 */
export function clearCapturedData(): void {
  clearCapturedPhotos();
  clearStudioConfig();
  removeKey(FRAME_KEY);
  removeKey(FILTER_KEY);
}

/** Hapus SELURUH data sesi photobooth (termasuk photo_count). */
export function clearPhotoboothSession(): void {
  clearCapturedData();
  removeKey(COUNT_KEY);
}

/**
 * Mulai sesi photobooth baru (titik masuk alur: homepage/jumlah-foto).
 * Membersihkan foto, konfigurasi studio, frame, dan filter lama;
 * photo_count ditulis ulang saat konfirmasi. Idempoten.
 */
export function startNewPhotoboothSession(): void {
  clearCapturedData();
}

/**
 * True bila halaman dimuat lewat refresh browser (bukan navigasi
 * dalam aplikasi). Dipakai /take-foto untuk membedakan "sesi baru
 * via refresh" (foto lama dibuang) dari navigasi normal (foto kept).
 */
export function isReloadNavigation(): boolean {
  try {
    const entries = performance.getEntriesByType('navigation');
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}
