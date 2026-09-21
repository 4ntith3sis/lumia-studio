'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import EffectSliderEditor from '@/components/admin/EffectSliderEditor';
import {
  getAllEffects,
  createEffect,
  updateEffect,
  deleteEffect,
  toggleEffectActive,
} from '@/lib/services/effect.service';
import type { Effect, EffectInsert, EffectSettings } from '@/types';
import { DEFAULT_EFFECT_SETTINGS, settingsToCssFilter } from '@/lib/photobooth/effect-utils';

type ModalMode = 'add' | 'edit' | null;
type DeleteTarget = Effect | null;

export default function AdminEffectsPage() {
  const [effects, setEffects] = useState<Effect[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedEffect, setSelectedEffect] = useState<Effect | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formSettings, setFormSettings] = useState<EffectSettings>(DEFAULT_EFFECT_SETTINGS);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await getAllEffects();
      setEffects(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat efek.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resetForm = (effect?: Effect) => {
    setSelectedEffect(effect ?? null);
    setFormName(effect?.name ?? '');
    setFormDesc(effect?.description ?? '');
    setFormActive(effect?.is_active ?? true);
    setFormSortOrder(effect?.sort_order ?? 0);
    setFormSettings(effect?.settings ?? { ...DEFAULT_EFFECT_SETTINGS });
    setErrorMessage('');
  };

  const openAdd = () => {
    resetForm();
    setModalMode('add');
  };
  const openEdit = (e: Effect) => {
    resetForm(e);
    setModalMode('edit');
  };
  const closeModal = () => {
    setModalMode(null);
    setSelectedEffect(null);
  };
  const openDelete = (e: Effect) => setDeleteTarget(e);
  const closeDelete = () => setDeleteTarget(null);

  const slugify = (name: string) =>
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'effect';

  const handleSubmit = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!formName.trim()) {
      setErrorMessage('Nama efek wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      const input: EffectInsert = {
        name: formName.trim(),
        slug: selectedEffect?.slug ?? slugify(formName),
        filter_id: 'custom',
        description: formDesc.trim() || null,
        is_active: formActive,
        sort_order: formSortOrder,
        settings: formSettings,
      };
      if (modalMode === 'add') {
        await createEffect(input);
        setSuccessMessage('Efek berhasil ditambahkan.');
      } else if (selectedEffect) {
        await updateEffect(selectedEffect.id, input);
        setSuccessMessage('Efek berhasil diperbarui.');
      }
      closeModal();
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (e: Effect) => {
    setSubmitting(true);
    try {
      await toggleEffectActive(e.id, !e.is_active);
      setSuccessMessage(`Efek "${e.name}" ${!e.is_active ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengubah status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setErrorMessage('');
    try {
      await deleteEffect(deleteTarget.id);
      setSuccessMessage(`Efek "${deleteTarget.name}" berhasil dihapus.`);
      closeDelete();
      await load();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus efek.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="admin-title">Effects</h1>
          <p className="admin-subtitle">Kelola efek foto berbasis slider parameter visual.</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <svg className="icon-svg" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Tambah Efek
        </button>
      </div>

      {successMessage && (
        <div style={{ background: '#E8F5E9', border: '2px solid #4CAF50', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#2E7D32' }}>
          ✓ {successMessage}
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Memuat efek...</div>
      ) : errorMessage ? (
        <div className="admin-error" role="alert">{errorMessage}</div>
      ) : effects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#FFF', border: '3px solid var(--color-border-dark)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-pop)' }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Belum ada efek</p>
          <p style={{ color: 'var(--color-text-secondary)' }}>Klik &quot;Tambah Efek&quot; untuk memulai.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {effects.map((e) => (
            <div key={e.id} style={{ background: '#FFFFFF', border: '3px solid var(--color-border-dark)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-pop)', opacity: e.is_active ? 1 : 0.6, transition: 'opacity 0.15s ease' }}>
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, background: e.is_active ? 'var(--color-accent-yellow)' : 'var(--color-text-muted)', color: e.is_active ? 'var(--color-text-dark)' : '#FFF', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--color-border-dark)' }}>
                    {e.is_active ? 'AKTIF' : 'NONAKTIF'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Urut {e.sort_order}</span>
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.35rem' }}>{e.name}</h3>
                {e.description && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{e.description}</p>}
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace', background: 'var(--color-bg-main)', padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
                  {settingsToCssFilter(e.settings)}
                </div>
              </div>
              <div style={{ borderTop: '2px solid var(--color-border-dark)', padding: '0.6rem 0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-secondary" style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }} onClick={() => openEdit(e)}>Edit</button>
                <button className="btn-secondary" style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem', background: e.is_active ? '#FFF5F5' : '#F1F8E9', color: e.is_active ? '#FF5232' : '#4CAF50' }} onClick={() => void handleToggle(e)}>
                  {e.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button className="btn-secondary" style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem', background: '#FFF5F5', color: '#FF5232' }} onClick={() => openDelete(e)}>Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal dengan Slider Editor */}
      {modalMode && (
        <ModalOverlay onClose={closeModal}>
          <div style={{ width: '100%', maxWidth: '720px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              {modalMode === 'add' ? 'Tambah Efek Baru' : 'Edit Efek'}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {modalMode === 'add' ? 'Buat efek filter baru dengan mengatur parameter visual.' : `Mengedit "${selectedEffect?.name}"`}
            </p>

            {/* Slider Editor dengan Live Preview */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-bg-main)', border: '2px solid var(--color-border-dark)', borderRadius: 'var(--radius-md)' }}>
              <EffectSliderEditor
                settings={formSettings}
                onChange={setFormSettings}
                onReset={() => setFormSettings({ ...DEFAULT_EFFECT_SETTINGS })}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Nama Efek <span style={{ color: '#FF5232' }}>*</span>
              </label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Contoh: Vintage Warm" style={{ width: '100%', padding: '0.7rem 1rem', border: '2px solid var(--color-border-dark)', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontFamily: 'var(--font-sans)', background: '#FFF', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Deskripsi (opsional)
              </label>
              <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} placeholder="Penjelasan singkat efek..." style={{ width: '100%', padding: '0.7rem 1rem', border: '2px solid var(--color-border-dark)', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontFamily: 'var(--font-sans)', background: '#FFF', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Urutan tampil
                </label>
                <input type="number" min={0} max={999} value={formSortOrder} onChange={(e) => setFormSortOrder(Number(e.target.value))} style={{ width: '100%', padding: '0.7rem 1rem', border: '2px solid var(--color-border-dark)', borderRadius: 'var(--radius-md)', fontSize: '1rem', fontFamily: 'var(--font-sans)', background: '#FFF', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '2.1rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>Aktif</label>
                <button type="button" onClick={() => setFormActive(!formActive)} style={{ width: '48px', height: '28px', borderRadius: '14px', border: '2px solid var(--color-border-dark)', background: formActive ? 'var(--color-accent-primary)' : 'var(--color-bg-main)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#FFF', border: '2px solid var(--color-border-dark)', position: 'absolute', top: '1px', left: formActive ? '22px' : '1px', transition: 'left 0.2s' }} />
                </button>
              </div>
            </div>

            {errorMessage && (
              <div style={{ background: '#FFF5F5', border: '2px solid #FF5232', borderRadius: 'var(--radius-md)', padding: '0.6rem 1rem', fontSize: '0.85rem', color: '#FF5232', marginBottom: '1rem' }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-secondary" onClick={closeModal} disabled={submitting}>Batal</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Menyimpan...' : modalMode === 'add' ? 'Simpan Efek' : 'Perbarui Efek'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <ModalOverlay onClose={closeDelete}>
          <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>Hapus Efek?</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
              <strong>{deleteTarget.name}</strong>
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
              Efek akan dihapus permanen. Pengguna tidak akan melihat efek ini lagi di studio.
            </p>

            {errorMessage && (
              <div style={{ background: '#FFF5F5', border: '2px solid #FF5232', borderRadius: 'var(--radius-md)', padding: '0.6rem 1rem', fontSize: '0.85rem', color: '#FF5232', marginBottom: '1rem' }}>
                {errorMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn-secondary" onClick={closeDelete} disabled={deleting}>Batal</button>
              <button className="btn-primary" onClick={handleDeleteConfirm} disabled={deleting} style={{ background: '#FF5232' }}>
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </AdminLayout>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: '#FFFFFF', border: '3px solid var(--color-border-dark)', borderRadius: 'var(--radius-lg)', padding: '2rem', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-pop-lg)' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
