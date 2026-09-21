-- ============================================================
-- LUMIA PHOTOBOOTH — Efek/Filter Database (Phase 7) — REVISI
-- Jalankan di Supabase SQL Editor. Idempotent & aman.
-- ============================================================

-- 1. Table effects
CREATE TABLE IF NOT EXISTS public.effects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  filter_id         text not null,
  description       text,
  preview_image_url text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2. Enable RLS
ALTER TABLE public.effects ENABLE ROW LEVEL SECURITY;

-- 3. Admin CRUD policy
DROP POLICY IF EXISTS "admin_full_effects" ON public.effects;
CREATE POLICY "admin_full_effects"
  ON public.effects FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- 4. Publik hanya baca yang aktif
DROP POLICY IF EXISTS "public_read_active_effects" ON public.effects;
CREATE POLICY "public_read_active_effects"
  ON public.effects FOR SELECT
  USING (is_active = true);

-- 5. Seed 7 filter default (aman diulang)
INSERT INTO public.effects (name, slug, filter_id, description, sort_order, is_active)
VALUES
  ('Normal',          'filter-normal',   'none',                                                'Tanpa filter',              0,  true),
  ('Vintage Warm',    'filter-vintage',  'sepia(0.35) contrast(1.1) brightness(1.05) saturate(1.2)', 'Hangat retro',             10, true),
  ('Monochrome',      'filter-bw',       'grayscale(1) contrast(1.2) brightness(0.95)',            'Hitam putih',              20, true),
  ('Soft Pastel',     'filter-pastel',   'saturate(1.3) brightness(1.1) hue-rotate(-10deg)',       'Lembut & pastel',          30, true),
  ('Cyber Neon',      'filter-cyber',    'hue-rotate(190deg) saturate(1.8) contrast(1.1)',         'Neon cyberpunk',           40, true),
  ('Retro Sepia',     'filter-sepia',    'sepia(0.85) contrast(1.1) brightness(0.95)',             'Sepia klasik',             50, true),
  ('Vibrant Pop',     'filter-sharp',    'contrast(1.35) saturate(1.5)',                           'Pop warna tinggi',         60, true)
ON CONFLICT (slug) DO NOTHING;
