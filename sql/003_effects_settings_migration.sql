-- ============================================================
-- LUMIA PHOTOBOOTH — Effects Settings Migration (Phase 8)
-- Tambah kolom settings JSONB untuk slider-based effect editor.
-- Idempotent & backward-compatible.
-- ============================================================

-- 1. Tambah kolom settings jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'effects'
      AND column_name = 'settings'
  ) THEN
    ALTER TABLE public.effects ADD COLUMN settings jsonb NOT NULL DEFAULT '{
      "brightness": 100,
      "contrast": 100,
      "saturation": 100,
      "grayscale": 0,
      "sepia": 0,
      "hueRotate": 0,
      "blur": 0,
      "opacity": 100
    }'::jsonb;
  END IF;
END $$;

-- 2. Migrasi data existing ke format settings (backward-compatible)
-- Efek lama yang pakai filter_id hardcoded diconvert ke settings default
-- atau nilai dari CSS filter yang sudah ada.
UPDATE public.effects
SET settings = jsonb_build_object(
  'brightness', CASE
    WHEN filter_id LIKE '%brightness(%' THEN CAST(regexp_replace(filter_id, '.*brightness\(([^)]+)\).*', '\1') AS numeric) * 100 / 100
    ELSE 100
  END,
  'contrast', CASE
    WHEN filter_id LIKE '%contrast(%' THEN CAST(regexp_replace(filter_id, '.*contrast\(([^)]+)\).*', '\1') AS numeric) * 100 / 100
    ELSE 100
  END,
  'saturation', CASE
    WHEN filter_id LIKE '%saturate(%' THEN CAST(regexp_replace(filter_id, '.*saturate\(([^)]+)\).*', '\1') AS numeric) * 100 / 100
    ELSE 100
  END,
  'grayscale', CASE
    WHEN filter_id LIKE '%grayscale(%' THEN CAST(regexp_replace(filter_id, '.*grayscale\(([^)]+)\).*', '\1') AS numeric) * 100
    ELSE 0
  END,
  'sepia', CASE
    WHEN filter_id LIKE '%sepia(%' THEN CAST(regexp_replace(filter_id, '.*sepia\(([^)]+)\).*', '\1') AS numeric) * 100
    ELSE 0
  END,
  'hueRotate', CASE
    WHEN filter_id LIKE '%hue-rotate(%' THEN CAST(regexp_replace(filter_id, '.*hue-rotate\(([^)]+)\).*', '\1') AS numeric)
    ELSE 0
  END,
  'blur', 0,
  'opacity', 100
)
WHERE filter_id != 'none'
  AND (settings IS NULL OR settings = '{}');

-- 3. Update seed effects dengan settings baru
INSERT INTO public.effects (name, slug, filter_id, description, sort_order, is_active, settings)
VALUES
  ('Normal',          'filter-normal',   'none',                     'Tanpa filter',              0,  true,  '{"brightness":100,"contrast":100,"saturation":100,"grayscale":0,"sepia":0,"hueRotate":0,"blur":0,"opacity":100}'::jsonb),
  ('Vintage Warm',    'filter-vintage',  'sepia(0.35)...',           'Hangat retro',             10, true,  '{"brightness":105,"contrast":110,"saturation":120,"grayscale":0,"sepia":35,"hueRotate":0,"blur":0,"opacity":100}'::jsonb),
  ('Monochrome',      'filter-bw',       'grayscale(1)...',          'Hitam putih',              20, true,  '{"brightness":95,"contrast":120,"saturation":0,"grayscale":100,"sepia":0,"hueRotate":0,"blur":0,"opacity":100}'::jsonb),
  ('Soft Pastel',     'filter-pastel',   'saturate(1.3)...',         'Lembut & pastel',          30, true,  '{"brightness":110,"contrast":100,"saturation":130,"grayscale":0,"sepia":0,"hueRotate":-10,"blur":0,"opacity":100}'::jsonb),
  ('Cyber Neon',      'filter-cyber',    'hue-rotate(190)...',       'Neon cyberpunk',           40, true,  '{"brightness":110,"contrast":110,"saturation":180,"grayscale":0,"sepia":0,"hueRotate":190,"blur":0,"opacity":100}'::jsonb),
  ('Retro Sepia',     'filter-sepia',    'sepia(0.85)...',           'Sepia klasik',             50, true,  '{"brightness":95,"contrast":110,"saturation":80,"grayscale":0,"sepia":85,"hueRotate":0,"blur":0,"opacity":100}'::jsonb),
  ('Vibrant Pop',     'filter-sharp',    'contrast(1.35)...',        'Pop warna tinggi',         60, true,  '{"brightness":100,"contrast":135,"saturation":150,"grayscale":0,"sepia":0,"hueRotate":0,"blur":0,"opacity":100}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  settings = EXCLUDED.settings,
  updated_at = now();
