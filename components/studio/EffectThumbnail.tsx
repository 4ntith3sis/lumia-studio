'use client';

import { useState } from 'react';
import type { EffectSettings } from '@/types';
import { settingsToCssFilter } from '@/lib/photobooth/effect-utils';

interface EffectThumbnailProps {
  photoUrl: string | null;
  settings: EffectSettings;
  isSelected: boolean;
  onClick: () => void;
  name: string;
}

/**
 * Thumbnail efek menggunakan foto aktual pengguna.
 * Memakai <img> + CSS filter agar posisi foto selalu center-crop
 * secara native (tidak tertekan rasio canvas lama 3:4 di container 1:1).
 */
export default function EffectThumbnail({ photoUrl, settings, isSelected, onClick, name }: EffectThumbnailProps) {
  const [imgError, setImgError] = useState(false);
  const filterCss = settingsToCssFilter(settings);

  return (
    <div
      className={`option-card${isSelected ? ' selected' : ''}`}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
      style={{ cursor: 'pointer' }}
    >
      <div className="option-preview-box" style={{ background: '#FFF5E4', overflow: 'hidden', position: 'relative' }}>
        {photoUrl && !imgError ? (
          <img
            src={photoUrl}
            alt={`Preview ${name}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              display: 'block',
              filter: filterCss === 'none' ? 'none' : filterCss,
            }}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            {imgError ? 'Error' : '...'}
          </div>
        )}
      </div>
      <div className="option-title" style={{ fontSize: '0.7rem' }}>{name}</div>
    </div>
  );
}
