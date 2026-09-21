import Link from 'next/link';
import FrameCard from '@/components/photobooth/FrameCard';
import type { Frame, ValidPhotoCount } from '@/types';

interface FrameGalleryProps {
  frames: Frame[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  photoCount: ValidPhotoCount;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

/**
 * Galeri frame hasil query getFramesByPhotoCount (sudah difilter
 * photo_count + is_active di database — tidak ada filter ulang
 * kategori di browser selain pengaman defensif di screen).
 */
export default function FrameGallery({
  frames,
  selectedId,
  onSelect,
  photoCount,
  loading,
  error,
  onRetry,
}: FrameGalleryProps) {
  if (loading) {
    return (
      <div className="frame-gallery-scroll" aria-busy="true" aria-label="Memuat frame">
        <div className="frame-gallery" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="frame-skeleton" />
          ))}
        </div>
        <p className="frame-state-hint">Memuat frame...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="frame-gallery-scroll">
        <div className="frame-state frame-state-error" role="alert">
          <div className="frame-state-title">Gagal memuat frame</div>
          <p className="frame-state-desc">{error}</p>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="frame-gallery-scroll">
        <div className="frame-state" role="status">
          <div className="frame-state-emoji" aria-hidden="true">
            🖼️
          </div>
          <div className="frame-state-title">Belum ada frame {photoCount} foto</div>
          <p className="frame-state-desc">
            Minta admin menambahkan frame kategori ini, atau pilih jumlah foto lain.
          </p>
          <Link href="/jumlah-foto" className="btn-secondary">
            Pilih Jumlah Lain
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="frame-gallery-scroll">
      <div className="frame-gallery" role="listbox" aria-label={`Frame ${photoCount} foto`}>
        {frames.map((frame) => (
          <FrameCard
            key={frame.id}
            frame={frame}
            selected={selectedId === frame.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
