import type { EffectSettings } from '@/types';

/** Default settings efek (normal/tanpa filter). */
export const DEFAULT_EFFECT_SETTINGS: EffectSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  blur: 0,
  opacity: 100,
};

/**
 * Konversi EffectSettings menjadi CSS filter string yang konsisten
 * antara preview (CSS) dan export (Canvas ctx.filter).
 *
 * Urutan filter penting untuk konsistensi hasil:
 * 1. blur (px)
 * 2. brightness (%)
 * 3. contrast (%)
 * 4. grayscale (%)
 * 5. sepia (%)
 * 6. saturate (%)
 * 7. hue-rotate (deg)
 * 8. opacity (%)
 */
export function settingsToCssFilter(settings: EffectSettings): string {
  const parts: string[] = [];

  if (settings.blur > 0) {
    parts.push(`blur(${settings.blur}px)`);
  }
  if (settings.brightness !== 100) {
    parts.push(`brightness(${settings.brightness}%)`);
  }
  if (settings.contrast !== 100) {
    parts.push(`contrast(${settings.contrast}%)`);
  }
  if (settings.grayscale > 0) {
    parts.push(`grayscale(${settings.grayscale}%)`);
  }
  if (settings.sepia > 0) {
    parts.push(`sepia(${settings.sepia}%)`);
  }
  if (settings.saturation !== 100) {
    parts.push(`saturate(${settings.saturation}%)`);
  }
  if (settings.hueRotate !== 0) {
    parts.push(`hue-rotate(${settings.hueRotate}deg)`);
  }
  if (settings.opacity !== 100) {
    parts.push(`opacity(${settings.opacity}%)`);
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}

/**
 * Validasi dan clamp nilai settings ke range yang aman.
 */
export function validateEffectSettings(input: Partial<EffectSettings>): EffectSettings {
  return {
    brightness: Math.max(0, Math.min(200, input.brightness ?? 100)),
    contrast: Math.max(0, Math.min(200, input.contrast ?? 100)),
    saturation: Math.max(0, Math.min(200, input.saturation ?? 100)),
    grayscale: Math.max(0, Math.min(100, input.grayscale ?? 0)),
    sepia: Math.max(0, Math.min(100, input.sepia ?? 0)),
    hueRotate: Math.max(0, Math.min(360, input.hueRotate ?? 0)),
    blur: Math.max(0, Math.min(10, input.blur ?? 0)),
    opacity: Math.max(0, Math.min(100, input.opacity ?? 100)),
  };
}

/**
 * Merge settings dengan default (untuk backward compatibility).
 */
export function mergeEffectSettings(databaseSettings: unknown): EffectSettings {
  if (typeof databaseSettings === 'object' && databaseSettings !== null && !Array.isArray(databaseSettings)) {
    const s = databaseSettings as Partial<EffectSettings>;
    return validateEffectSettings({
      brightness: s.brightness,
      contrast: s.contrast,
      saturation: s.saturation,
      grayscale: s.grayscale,
      sepia: s.sepia,
      hueRotate: s.hueRotate,
      blur: s.blur,
      opacity: s.opacity,
    });
  }
  return { ...DEFAULT_EFFECT_SETTINGS };
}
