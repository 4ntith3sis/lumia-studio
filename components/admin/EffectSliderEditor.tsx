'use client';

import { useState, useCallback } from 'react';
import type { EffectSettings } from '@/types';
import { DEFAULT_EFFECT_SETTINGS } from '@/lib/photobooth/effect-utils';

interface EffectSliderEditorProps {
  settings: EffectSettings;
  onChange: (settings: EffectSettings) => void;
  onReset: () => void;
}

interface SliderConfig {
  key: keyof EffectSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, unit: '%' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'hueRotate', label: 'Hue Rotate', min: 0, max: 360, step: 1, unit: 'deg' },
  { key: 'blur', label: 'Blur', min: 0, max: 10, step: 0.5, unit: 'px' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
];

export default function EffectSliderEditor({ settings, onChange, onReset }: EffectSliderEditorProps) {
  const [livePreview, setLivePreview] = useState(settings);

  const handleChange = useCallback((key: keyof EffectSettings, value: number) => {
    setLivePreview((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleApply = useCallback(() => {
    onChange(livePreview);
  }, [onChange, livePreview]);

  const handleReset = useCallback(() => {
    setLivePreview({ ...DEFAULT_EFFECT_SETTINGS });
    onReset();
  }, [onReset]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Sliders Panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {SLIDER_CONFIGS.map((cfg) => (
          <div key={cfg.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ width: 90, fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-dark)' }}>
              {cfg.label}
            </label>
            <input
              type="range"
              min={cfg.min}
              max={cfg.max}
              step={cfg.step}
              value={livePreview[cfg.key]}
              onChange={(e) => handleChange(cfg.key, Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-accent-primary)' }}
              aria-label={cfg.label}
            />
            <span style={{
              width: 55,
              textAlign: 'right',
              fontSize: '0.8rem',
              fontWeight: 800,
              color: 'var(--color-accent-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {livePreview[cfg.key]}{cfg.unit}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="button" className="btn-secondary" onClick={handleApply} style={{ fontSize: '0.8rem' }}>
            Terapkan ke Form
          </button>
          <button type="button" className="btn-secondary" onClick={handleReset} style={{ fontSize: '0.8rem' }}>
            Reset ke Default
          </button>
        </div>
      </div>
    </div>
  );
}
