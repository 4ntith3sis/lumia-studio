export type ScreenNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PhotoCountOption {
  count: number;
  label: string;
  desc: string;
  layoutClass: string;
  badge?: string;
}

export interface GuideStep {
  step: number;
  title: string;
  desc: string;
}

export interface CaptureSlot {
  index: number;
  dataUrl?: string;
}

/* ─── Frame ─────────────────────────────────────────────── */
export type ValidPhotoCount = 2 | 3 | 4 | 6;

export interface Frame {
  id: string;
  name: string;
  image_url: string;
  photo_count: ValidPhotoCount;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FrameInsert {
  name: string;
  image_url: string;
  photo_count: ValidPhotoCount;
  is_active?: boolean;
}

/* ─── Profile / Admin ───────────────────────────────────── */
export interface Profile {
  id: string;
  email?: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

/* ─── Auth session (client-side) ────────────────────────── */
export interface SupabaseSession {
  user: { id: string; email?: string } | null;
  access_token?: string;
}

/* ─── Effects / Filter ─────────────────────────────────── */
export interface EffectSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  hueRotate: number;
  blur: number;
  opacity: number;
}

export interface Effect {
  id: string;
  name: string;
  slug: string;
  filter_id: string;
  description: string | null;
  preview_image_url: string | null;
  is_active: boolean;
  sort_order: number;
  settings: EffectSettings;
  created_at: string;
  updated_at: string;
}

export interface EffectInsert {
  name: string;
  slug: string;
  filter_id: string;
  description?: string | null;
  preview_image_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
  settings?: EffectSettings;
}

