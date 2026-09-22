import { boomerangOrder, loadImage } from '@/lib/photobooth/composite';

/**
 * Phase 6 — download & boomerang. Semua lokal di browser
 * (tanpa upload server, tanpa service role).
 */

export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Download tiap foto asli (tanpa frame/filter/posisi) satu per satu. */
export async function downloadOriginals(photos: string[], targetCount?: number): Promise<void> {
  const count = targetCount ?? photos.length;
  for (let i = 0; i < count && i < photos.length; i++) {
    const blob = await dataUrlToBlob(photos[i]);
    const url = URL.createObjectURL(blob);
    try {
      downloadUrl(url, `lumia-original-${pad2(i + 1)}.jpg`);
    } finally {
      // Revoke tertunda agar browser sempat memulai download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) throw new Error('Export canvas gagal.');
    const url = URL.createObjectURL(blob);
    try {
      downloadUrl(url, filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }, 'image/png');
}

type RecorderMime = { mime: string; ext: string } | null;

/** Pilih mime MediaRecorder yang benar-benar didukung browser. */
export function pickBoomerangMime(): RecorderMime {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      /* lanjut kandidat berikutnya */
    }
  }
  return null;
}

export interface BoomerangResult {
  blob: Blob;
  ext: string;
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number
): void {
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * Rekam boomerang dari foto asli: maju 1..N lalu mundur N-1..2.
 * Output WebM valid via MediaRecorder (bukan klaim GIF/MP4).
 */
export async function recordBoomerang(
  photos: string[],
  onProgress?: (done: number, total: number) => void
): Promise<BoomerangResult> {
  const picked = pickBoomerangMime();
  if (!picked) {
    throw new Error('Browser ini tidak mendukung perekaman video (MediaRecorder/WebM).');
  }
  if (photos.length === 0) throw new Error('Tidak ada foto untuk boomerang.');

  const W = 800;
  const H = 600;
  const FRAME_MS = 500;
  const LOOPS = 2;

  const imgs = await Promise.all(photos.map((u) => loadImage(u)));
  const order = boomerangOrder(photos.length);
  const totalFrames = order.length * LOOPS;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser ini.');

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onerror = () => reject(new Error('Perekaman boomerang gagal.'));
    rec.onstop = () => resolve(new Blob(chunks, { type: picked.mime }));
  });

  rec.start(250);
  try {
    let drawn = 0;
    for (let loop = 0; loop < LOOPS; loop++) {
      for (const idx of order) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        drawCover(ctx, imgs[idx], W, H);
        drawn += 1;
        onProgress?.(drawn, totalFrames);
        await new Promise((r) => setTimeout(r, FRAME_MS));
      }
    }
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    stream.getTracks().forEach((t) => t.stop());
  }

  const blob = await done;
  if (blob.size === 0) throw new Error('Hasil boomerang kosong.');
  return { blob, ext: picked.ext };
}
