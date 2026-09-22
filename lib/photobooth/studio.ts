import type { ValidPhotoCount } from '@/types';

/**
 * Phase 5 — geometri slot & konfigurasi Studio Editor.
 *
 * Slot foto diselesaikan dari PNG frame aktual via
 * `lib/photobooth/frame-slots.ts` (deteksi region transparan),
 * sehingga layout frame apa pun (1×4, 2×2, 3×1, 2×3, …) sejajar
 * dengan jendela foto yang sebenarnya dan tiap foto dirender
 * tepat satu kali di slotnya.
 *
 * `gridForCount()` / `computeSlots()` dipertahankan HANYA untuk
 * kasus tanpa frame (tidak ada overlay yang bisa mismatch).
 */

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoAdjust {
  dx: number;
  dy: number;
  zoom: number;
}

export interface StudioConfig {
  version: 1;
  photo_count: ValidPhotoCount;
  frame_id: string | null;
  filter_id: string;
  adjustments: PhotoAdjust[];
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

const CONFIG_KEY = 'lumia_studio_config';

export function gridForCount(count: ValidPhotoCount): { cols: number; rows: number } {
  switch (count) {
    case 2:
      return { cols: 1, rows: 2 };
    case 3:
      return { cols: 1, rows: 3 };
    case 4:
      return { cols: 2, rows: 2 };
    case 6:
      return { cols: 2, rows: 3 };
  }
}

export function defaultAdjustments(count: number): PhotoAdjust[] {
  return Array.from({ length: count }, () => ({ dx: 0, dy: 0, zoom: 1 }));
}

/** Grid slot dalam koordinat logis canvas (pad/gap sebagai fraksi). */
export function computeSlots(
  count: ValidPhotoCount,
  W: number,
  H: number,
  pad = 0.04,
  gap = 0.02
): SlotRect[] {
  const { cols, rows } = gridForCount(count);
  const px = W * pad;
  const py = H * pad;
  const gx = W * gap;
  const gy = H * gap;
  const cw = (W - px * 2 - gx * (cols - 1)) / cols;
  const ch = (H - py * 2 - gy * (rows - 1)) / rows;
  const slots: SlotRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: px + c * (cw + gx), y: py + r * (ch + gy), w: cw, h: ch });
    }
  }
  return slots;
}

function isValidAdjust(value: unknown): value is PhotoAdjust {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.dx === 'number' &&
    Number.isFinite(a.dx) &&
    typeof a.dy === 'number' &&
    Number.isFinite(a.dy) &&
    typeof a.zoom === 'number' &&
    Number.isFinite(a.zoom)
  );
}

function clampAdjust(a: PhotoAdjust): PhotoAdjust {
  return {
    dx: Math.max(-2000, Math.min(2000, a.dx)),
    dy: Math.max(-2000, Math.min(2000, a.dy)),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, a.zoom)),
  };
}

/**
 * Batasi offset agar foto SELALU menutupi slot penuh (tidak ada celah).
 * Dihitung dinamis: dimensi foto setelah cover-scale × zoom vs slot.
 * Foto hasil cover selalu >= slot, sehingga batas = (drawn - slot)/2
 * per sumbu. Berlaku untuk semua rasio/count; tanpa angka hardcoded.
 */
export function clampAdjustToSlot(
  adj: PhotoAdjust,
  imgW: number,
  imgH: number,
  slot: SlotRect
): PhotoAdjust {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, adj.zoom));
  const base = Math.max(slot.w / imgW, slot.h / imgH);
  const dw = imgW * base * zoom;
  const dh = imgH * base * zoom;
  const maxDx = Math.max(0, (dw - slot.w) / 2);
  const maxDy = Math.max(0, (dh - slot.h) / 2);
  return {
    dx: Math.max(-maxDx, Math.min(maxDx, adj.dx)),
    dy: Math.max(-maxDy, Math.min(maxDy, adj.dy)),
    zoom,
  };
}

export function getStudioConfig(count: ValidPhotoCount): StudioConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioConfig>;
    if (parsed.version !== 1 || parsed.photo_count !== count) return null;
    const adjustments = Array.isArray(parsed.adjustments)
      ? parsed.adjustments.map((a) => (isValidAdjust(a) ? clampAdjust(a) : { dx: 0, dy: 0, zoom: 1 }))
      : [];
    while (adjustments.length < count) adjustments.push({ dx: 0, dy: 0, zoom: 1 });
    return {
      version: 1,
      photo_count: count,
      frame_id: typeof parsed.frame_id === 'string' ? parsed.frame_id : null,
      filter_id: typeof parsed.filter_id === 'string' && parsed.filter_id !== '' ? parsed.filter_id : 'filter-normal',
      adjustments: adjustments.slice(0, count),
    };
  } catch {
    return null;
  }
}

export function setStudioConfig(config: StudioConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* abaikan — session opsional */
  }
}

export function clearStudioConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CONFIG_KEY);
  } catch {
    /* abaikan — session opsional */
  }
}
