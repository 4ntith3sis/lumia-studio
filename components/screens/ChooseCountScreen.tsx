'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import {
  getPhotoCount,
  isValidPhotoCount,
  setPhotoCount,
  startNewPhotoboothSession,
} from '@/lib/photobooth/session';
import { PhotoCountOption, GuideStep, ValidPhotoCount } from '@/types';

const COUNT_OPTIONS: (Omit<PhotoCountOption, 'count'> & { count: ValidPhotoCount })[] = [
  { count: 2, label: '2 Foto', desc: 'Duo Photostrip', layoutClass: 'layout-2' },
  { count: 3, label: '3 Foto', desc: 'Triple Photostrip', layoutClass: 'layout-3' },
  { count: 4, label: '4 Foto', desc: 'Quad Grid Collage', layoutClass: 'layout-4', badge: 'Favorit' },
  { count: 6, label: '6 Foto', desc: 'Six Grid Deluxe', layoutClass: 'layout-6', badge: 'Deluxe' },
];

const GUIDE_STEPS: GuideStep[] = [
  { step: 1, title: 'Pilih Jumlah Foto', desc: 'Tentukan 2, 3, 4, atau 6 pose foto sesuai keinginanmu.' },
  { step: 2, title: 'Pose & Tangkap', desc: 'Setiap foto diambil otomatis dengan countdown 3 detik.' },
  { step: 3, title: 'Frame & Filter', desc: 'Pilih warna frame estetik dan filter warna favoritmu.' },
  { step: 4, title: 'Download Instan', desc: 'Unduh hasil photobooth resolusi tinggi secara instan.' },
];

export default function ChooseCountScreen() {
  const router = useRouter();
  // Pulihkan pilihan sebelumnya jika valid (misal user menekan Kembali).
  const [selectedCount, setSelectedCount] = useState<ValidPhotoCount>(
    () => getPhotoCount() ?? 4
  );

  // Masuk halaman ini = awal alur baru: buang foto/konfigurasi lama
  // agar sesi sebelumnya tidak terbawa. Sekali saat mount (idempoten).
  useEffect(() => {
    startNewPhotoboothSession();
  }, []);

  const handleConfirm = () => {
    // Validasi: hanya 2, 3, 4, atau 6 yang boleh diteruskan.
    if (!isValidPhotoCount(selectedCount)) return;
    setPhotoCount(selectedCount);
    router.push('/take-foto');
  };

  return (
    <AppLayout>
      <div className="text-center">
        <h2 className="title-primary">Berapa Foto Yang Ingin Diambil?</h2>
        <p className="subtitle" style={{ marginTop: '0.4rem' }}>
          Pilih jumlah pose foto yang kamu inginkan untuk sesi kali ini.
        </p>
      </div>

      <div className="count-grid">
        {COUNT_OPTIONS.map((opt) => (
          <div
            key={opt.count}
            className={`count-card${selectedCount === opt.count ? ' selected' : ''}`}
            onClick={() => setSelectedCount(opt.count)}
          >
            {opt.badge && (
              <div
                className="count-badge-rec"
                style={{
                  background: opt.badge === 'Deluxe' ? 'var(--color-accent-pink)' : 'var(--color-accent-yellow)',
                  color: opt.badge === 'Deluxe' ? '#FFF' : 'var(--color-text-dark)',
                }}
              >
                {opt.badge}
              </div>
            )}
            <div className={`count-icon-box ${opt.layoutClass}`}>
              {Array.from({ length: opt.count }, (_, i) => (
                <div key={i} className="mini-box" />
              ))}
            </div>
            <div className="count-number">{opt.label}</div>
            <div className="count-desc">{opt.desc}</div>
          </div>
        ))}
      </div>

      <div className="user-guide-container">
        <div className="guide-header">
          <span className="guide-title-icon">
            <svg className="icon-svg" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
            </svg>
          </span>
          <span className="guide-title-text">Petunjuk Penggunaan</span>
        </div>

        <div className="guide-steps-grid">
          {GUIDE_STEPS.map((s) => (
            <div key={s.step} className="guide-step-item">
              <div className="step-badge">{s.step}</div>
              <div className="step-info">
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/" className="btn-secondary">
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Kembali
        </Link>
        <button
          className="btn-primary"
          onClick={handleConfirm}
        >
          Lanjut Ambil Foto
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </AppLayout>
  );
}
