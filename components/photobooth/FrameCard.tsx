import type { Frame } from '@/types';

interface FrameCardProps {
  frame: Frame;
  selected: boolean;
  onSelect: (id: string) => void;
}

/**
 * Kartu preview frame (gambar + nama + badge jumlah foto).
 * Memakai <img> biasa, bukan next/image: URL berasal dari Supabase
 * Storage (remote, tidak terdaftar di next.config) dan admin panel
 * memakai pola yang sama — konsisten tanpa mengubah konfigurasi.
 */
export default function FrameCard({ frame, selected, onSelect }: FrameCardProps) {
  return (
    <button
      type="button"
      className={`frame-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(frame.id)}
      aria-pressed={selected}
      aria-label={`Pilih frame ${frame.name}`}
    >
      <span className="frame-preview">
        <img
          src={frame.image_url}
          alt={`Preview frame ${frame.name}`}
          loading="lazy"
          draggable={false}
        />
      </span>
      <span className="frame-count-badge">{frame.photo_count} Foto</span>
      <span className="frame-name">{frame.name}</span>
    </button>
  );
}
