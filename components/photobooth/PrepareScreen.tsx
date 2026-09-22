import Link from 'next/link';
import AppLayout from '@/components/AppLayout';

export default function PrepareScreen() {
  return (
    <AppLayout>
      <div className="prep-card">
        <div className="prep-illustration">
          <svg className="icon-svg" viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>

        <div className="text-center">
          <h2 className="title-primary">Siapkan Pose Terbaikmu!</h2>
          <p className="subtitle" style={{ marginTop: '0.4rem' }}>
            Kamera akan mengambil foto otomatis sesuai jumlah yang kamu pilih.
          </p>
        </div>

        <div className="prep-checklist">
          <div className="prep-item">
            <span className="prep-item-icon">&#10003;</span>
            <span>Posisikan wajah tepat di tengah area kamera.</span>
          </div>
          <div className="prep-item">
            <span className="prep-item-icon">&#10003;</span>
            <span>Tersedia countdown 3 detik sebelum snapshot.</span>
          </div>
          <div className="prep-item">
            <span className="prep-item-icon">&#10003;</span>
            <span>Senyum dan ekspresikan gaya terbaikmu bersama Lumia!</span>
          </div>
        </div>

        <div className="page-actions-row">
          <Link href="/jumlah-foto" className="btn-secondary">
            <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Kembali
          </Link>
          <Link href="/take-foto" className="btn-primary">
            <svg className="icon-svg" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Mulai Kamera & Foto
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
