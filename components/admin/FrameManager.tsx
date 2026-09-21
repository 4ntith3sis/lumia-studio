'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getAllFrames,
  getFramesByPhotoCount,
  createFrame,
  updateFrame,
  deleteFrame,
  uploadFrameImage,
} from '@/lib/services/frame.service';
import type { Frame, ValidPhotoCount } from '@/types';

// Force dynamic rendering — requires live DB & auth
export const dynamic = 'force-dynamic';

const PHOTO_COUNTS: { value: ValidPhotoCount; label: string }[] = [
  { value: 2, label: '2 Foto' },
  { value: 3, label: '3 Foto' },
  { value: 4, label: '4 Foto' },
  { value: 6, label: '6 Foto' },
];

type ModalMode = 'add' | 'edit' | 'delete' | null;

interface FrameManagerProps {
  /** Kategori terkunci, atau 'all' untuk semua frame (kompatibilitas). */
  category: ValidPhotoCount | 'all';
}

/**
 * Pengelolaan frame (CRUD penuh) — logika bisnis sama seperti halaman
 * admin lama, dijadikan reusable dan dapat dikunci ke satu kategori
 * photo_count. Auth dijaga AdminLayout; service memakai authenticated
 * client + RLS (tanpa service role di browser).
 */
export default function FrameManager({ category }: FrameManagerProps) {
  const locked = category !== 'all';
  const defaultCount: ValidPhotoCount = locked ? category : 4;

  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formCount, setFormCount] = useState<ValidPhotoCount>(defaultCount);
  const [formActive, setFormActive] = useState(true);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string>('');

  const loadFrames = useCallback(async () => {
    setLoading(true);
    try {
      const data = locked
        ? await getFramesByPhotoCount(category)
        : await getAllFrames();
      setFrames(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat frame');
    } finally {
      setLoading(false);
    }
  }, [locked, category]);

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    loadFrames();
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const openAddModal = () => {
    resetForm();
    setSelectedFrame(null);
    setModalMode('add');
  };

  const openEditModal = (frame: Frame) => {
    setSelectedFrame(frame);
    setFormName(frame.name);
    setFormCount(frame.photo_count);
    setFormActive(frame.is_active);
    setFormImageUrl(frame.image_url);
    setImagePreview(frame.image_url);
    setFormImageFile(null);
    setModalMode('edit');
  };

  const openDeleteModal = (frame: Frame) => {
    setSelectedFrame(frame);
    setModalMode('delete');
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedFrame(null);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const resetForm = () => {
    setFormName('');
    setFormCount(defaultCount);
    setFormActive(true);
    setFormImageUrl('');
    setImagePreview('');
    setFormImageFile(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png') {
      setErrorMessage('Hanya file PNG yang diperbolehkan.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file maksimal 5 MB.');
      return;
    }
    setFormImageFile(file);
    setErrorMessage('');
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!formName.trim()) {
      setErrorMessage('Nama frame wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = formImageUrl;

      if (formImageFile) {
        imageUrl = await uploadFrameImage(formImageFile);
      }

      if (!imageUrl && modalMode === 'add') {
        setErrorMessage('Upload gambar frame terlebih dahulu.');
        setSubmitting(false);
        return;
      }

      if (modalMode === 'add') {
        await createFrame({ name: formName.trim(), image_url: imageUrl, photo_count: formCount, is_active: formActive });
        setSuccessMessage('Frame berhasil ditambahkan!');
      } else if (modalMode === 'edit' && selectedFrame) {
        const updates: Partial<{ name: string; image_url: string; photo_count: ValidPhotoCount; is_active: boolean }> = {
          name: formName.trim(),
          photo_count: formCount,
          is_active: formActive,
        };
        if (imageUrl) updates.image_url = imageUrl;
        await updateFrame(selectedFrame.id, updates);
        setSuccessMessage('Frame berhasil diperbarui!');
      }

      closeModal();
      loadFrames();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedFrame) return;
    setSubmitting(true);
    try {
      const { storageCleaned } = await deleteFrame(selectedFrame.id);
      closeModal();
      if (storageCleaned) {
        setSuccessMessage('Frame berhasil dihapus!');
      } else {
        setSuccessMessage(
          'Record frame terhapus, tetapi file gambar di Storage gagal dibersihkan. Periksa bucket frame-images.'
        );
      }
      loadFrames();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus frame.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFrames = filterCount !== null && !locked
    ? frames.filter((f) => f.photo_count === filterCount)
    : frames;

  const emptyLabel = locked
    ? `Belum ada frame ${category} foto`
    : filterCount !== null
      ? `Belum ada frame ${PHOTO_COUNTS.find(p => p.value === filterCount)?.label}`
      : 'Belum ada frame';

  return (
    <div>
      {locked && (
        <Link href="/admin/frames" className="admin-breadcrumb">
          <svg className="icon-svg" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Semua Kategori
        </Link>
      )}

      {/* Title & Add Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="admin-title">
            {locked ? `Frame ${category} Foto` : 'Kelola Frame'}
          </h1>
          <p className="admin-subtitle">
            {locked
              ? `Tambah, edit, dan atur status frame kategori ${category} foto`
              : 'Tambah, edit, dan atur status frame photobooth'}
          </p>
        </div>
        <button className="btn-primary" onClick={openAddModal}>
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Tambah Frame
        </button>
      </div>

      {/* Filter Tabs — hanya untuk tampilan semua kategori */}
      {!locked && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn-secondary${filterCount === null ? ' selected' : ''}`}
            onClick={() => setFilterCount(null)}
            style={{
              background: filterCount === null ? 'var(--color-accent-primary)' : '',
              color: filterCount === null ? '#FFF' : '',
              borderColor: 'var(--color-border-dark)',
            }}
          >
            Semua
          </button>
          {PHOTO_COUNTS.map((pc) => (
            <button
              key={pc.value}
              className="btn-secondary"
              onClick={() => setFilterCount(pc.value)}
              style={{
                background: filterCount === pc.value ? 'var(--color-accent-primary)' : '',
                color: filterCount === pc.value ? '#FFF' : '',
              }}
            >
              {pc.label}
            </button>
          ))}
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div style={{
          background: '#E8F5E9',
          border: '2px solid #4CAF50',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          fontWeight: 600,
          color: '#2E7D32',
        }}>
          ✓ {successMessage}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="admin-loading">
          Memuat frame...
        </div>
      ) : filteredFrames.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: '#FFF',
          border: '3px solid var(--color-border-dark)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)',
        }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            {emptyLabel}
          </p>
          <p style={{ color: 'var(--color-text-secondary)' }}>Klik &quot;Tambah Frame&quot; untuk memulai.</p>
        </div>
      ) : (
        /* Frame Grid */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1.25rem',
        }}>
          {filteredFrames.map((frame) => (
            <div
              key={frame.id}
              style={{
                background: '#FFFFFF',
                border: '3px solid var(--color-border-dark)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-pop)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                opacity: frame.is_active ? 1 : 0.6,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translate(-3px, -3px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '6px 6px 0px var(--color-border-dark)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = '';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-pop)';
              }}
            >
              {/* Preview */}
              <div style={{
                width: '100%',
                aspectRatio: '3/4',
                background: 'var(--color-bg-main)',
                border: '2px solid var(--color-border-dark)',
                borderBottom: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <img
                  src={frame.image_url}
                  alt={frame.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  loading="lazy"
                />
                {!frame.is_active && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(30,30,30,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{
                      background: 'var(--color-accent-primary)',
                      color: '#FFF',
                      padding: '0.3rem 0.8rem',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      border: '2px solid var(--color-border-dark)',
                    }}>
                      NONAKTIF
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    background: frame.is_active ? 'var(--color-accent-yellow)' : 'var(--color-text-muted)',
                    color: frame.is_active ? 'var(--color-text-dark)' : '#FFF',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    border: '1.5px solid var(--color-border-dark)',
                  }}>
                    {frame.photo_count} FOTO
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {new Date(frame.created_at).toLocaleDateString('id-ID')}
                  </span>
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>{frame.name}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-secondary" style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }} onClick={() => openEditModal(frame)}>
                    Edit
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', background: '#FFF5F5', color: '#FF5232' }}
                    onClick={() => openDeleteModal(frame)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Add / Edit Modal ─── */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <ModalOverlay onClose={closeModal}>
          <div style={{ width: '100%', maxWidth: '520px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              {modalMode === 'add' ? 'Tambah Frame Baru' : 'Edit Frame'}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {modalMode === 'add'
                ? locked
                  ? `Frame baru kategori ${category} foto.`
                  : 'Unggah frame PNG untuk photobooth.'
                : `Mengedit "${selectedFrame?.name}"`}
            </p>

            {/* Image Upload */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Gambar Frame (PNG)
              </label>
              <div style={{
                border: '2px dashed var(--color-border-dark)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                textAlign: 'center',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                aspectRatio: '3/4',
                maxWidth: '200px',
                margin: '0 auto',
                background: 'var(--color-bg-main)',
              }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🖼️</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                      Klik untuk upload PNG
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      Maks. 5 MB
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleImageChange}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                />
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Nama Frame
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Contoh: Lumia Classic"
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  border: '2px solid var(--color-border-dark)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1rem',
                  fontFamily: 'var(--font-sans)',
                  background: '#FFF',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Photo Count — terkunci saat kategori dipilih */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Kategori Jumlah Foto
              </label>
              {locked ? (
                <div style={{
                  padding: '0.6rem 1rem',
                  border: '2px solid var(--color-border-dark)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent-cream)',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                }}>
                  {category} Foto (mengikuti kategori ini)
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {PHOTO_COUNTS.map((pc) => (
                    <button
                      key={pc.value}
                      className={`btn-secondary${formCount === pc.value ? ' selected' : ''}`}
                      onClick={() => setFormCount(pc.value)}
                      style={{
                        padding: '0.6rem 0.5rem',
                        fontSize: '0.85rem',
                        textAlign: 'center',
                        background: formCount === pc.value ? 'var(--color-accent-primary)' : '',
                        color: formCount === pc.value ? '#FFF' : '',
                      }}
                    >
                      {pc.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Toggle */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
                Frame Aktif
              </label>
              <button
                type="button"
                onClick={() => setFormActive(!formActive)}
                style={{
                  width: '48px',
                  height: '28px',
                  borderRadius: '14px',
                  border: '2px solid var(--color-border-dark)',
                  background: formActive ? 'var(--color-accent-primary)' : 'var(--color-bg-main)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#FFF',
                  border: '2px solid var(--color-border-dark)',
                  position: 'absolute',
                  top: '1px',
                  left: formActive ? '22px' : '1px',
                  transition: 'left 0.2s',
                }} />
              </button>
              <span style={{ fontSize: '0.8rem', color: formActive ? '#4CAF50' : 'var(--color-text-muted)', fontWeight: 600 }}>
                {formActive ? 'Tersedia untuk user' : 'Disembunyikan dari user'}
              </span>
            </div>

            {errorMessage && (
              <div style={{
                background: '#FFF5F5',
                border: '2px solid #FF5232',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                color: '#FF5232',
                marginBottom: '1rem',
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-secondary" onClick={closeModal} disabled={submitting}>
                Batal
              </button>
              <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Menyimpan...' : (modalMode === 'add' ? 'Simpan Frame' : 'Perbarui Frame')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {modalMode === 'delete' && selectedFrame && (
        <ModalOverlay onClose={closeModal}>
          <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Hapus Frame?
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
              <strong>{selectedFrame.name}</strong>
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
              Frame ini akan dihapus permanen beserta gambarnya. Tindakan ini tidak dapat dibatalkan.
            </p>

            {errorMessage && (
              <div style={{
                background: '#FFF5F5',
                border: '2px solid #FF5232',
                borderRadius: 'var(--radius-md)',
                padding: '0.6rem 1rem',
                fontSize: '0.85rem',
                color: '#FF5232',
                marginBottom: '1rem',
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-secondary" onClick={closeModal} disabled={submitting}>
                Batal
              </button>
              <button
                className="btn-primary"
                onClick={handleDeleteConfirm}
                disabled={submitting}
                style={{ background: '#FF5232' }}
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ─── Reusable Modal Overlay ────────────────────────────── */
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '3px solid var(--color-border-dark)',
          borderRadius: 'var(--radius-lg)',
          padding: '2rem',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-pop-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
