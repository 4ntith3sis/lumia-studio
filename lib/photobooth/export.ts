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

/* ─── Boomerang output: MP4 ───────────────────────────────────
 * Prioritas:
 *  1. Rekam MP4 langsung via MediaRecorder (Safari 14.1+, Chrome/Edge
 *     modern) — dicek via isTypeSupported, tidak di-hardcode.
 *  2. Encode langsung via WebCodecs (VideoEncoder H.264) + mp4-muxer
 *     untuk browser tanpa MP4 MediaRecorder (tanpa perantara WebM).
 *  3. Jika keduanya tidak tersedia: error eksplisit. TIDAK PERNAH
 *     mengganti extension WebM menjadi .mp4 (file palsu).
 */

const BOOMERANG_W = 800;
const BOOMERANG_H = 600;
const BOOMERANG_FRAME_MS = 500;
const BOOMERANG_FRAME_US = BOOMERANG_FRAME_MS * 1000;
const BOOMERANG_LOOPS = 2;
const BOOMERANG_BITRATE = 5_000_000;
const BOOMERANG_CODEC = 'avc1.42E01E';

/** Kandidat MIME MP4 (H.264) — diuji via isTypeSupported, tidak di-hardcode. */
const MP4_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4;codecs="avc1.4D401E"',
  'video/mp4;codecs="avc1"',
  'video/mp4',
] as const;

/** Pilih MIME MP4 yang benar-benar didukung browser untuk MediaRecorder. */
export function pickMp4Mime(): RecorderMime {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MP4_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: 'mp4' };
    } catch {
      /* lanjut kandidat berikutnya */
    }
  }
  return null;
}

export interface BoomerangResult {
  blob: Blob;
  ext: string;
  mime: string;
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
 * Merekam langsung ke MP4 bila browser mendukungnya (Safari, Chrome modern).
 * Jangan gunakan fungsi ini untuk WebM — output harus selalu MP4 valid.
 */
export async function recordBoomerang(
  photos: string[],
  onProgress?: (done: number, total: number) => void,
  mimeOverride?: { mime: string; ext: string },
): Promise<BoomerangResult> {
  const picked = mimeOverride ?? pickMp4Mime();
  if (!picked) {
    throw new Error('Browser ini tidak mendukung perekaman video MP4.');
  }
  if (photos.length === 0) throw new Error('Tidak ada foto untuk boomerang.');

  const W = BOOMERANG_W;
  const H = BOOMERANG_H;
  const FRAME_MS = BOOMERANG_FRAME_MS;
  const LOOPS = BOOMERANG_LOOPS;

  const imgs = await Promise.all(photos.map((u) => loadImage(u)));
  const order = boomerangOrder(photos.length);
  const totalFrames = order.length * LOOPS;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser ini.');

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: BOOMERANG_BITRATE });
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
  if (!blob.type.startsWith('video/mp4')) {
    throw new Error('Hasil rekaman bukan MP4 yang valid.');
  }
  return { blob, ext: picked.ext, mime: picked.mime };
}

/**
 * Cek apakah browser mampu encode MP4 langsung via WebCodecs
 * (fallback untuk browser tanpa MP4 MediaRecorder, mis. Firefox).
 */
export async function canEncodeMp4Fallback(): Promise<boolean> {
  try {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
    const support = await VideoEncoder.isConfigSupported({
      codec: BOOMERANG_CODEC,
      width: BOOMERANG_W,
      height: BOOMERANG_H,
      bitrate: BOOMERANG_BITRATE,
      framerate: 2,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

/**
 * Encode boomerang langsung ke MP4 via WebCodecs (VideoEncoder H.264)
 * + mp4-muxer — tanpa perantara WebM, tanpa FFmpeg.
 * Visual identik dengan recordBoomerang: urutan, resolusi, dan durasi sama.
 */
export async function recordBoomerangMp4(
  photos: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (photos.length === 0) throw new Error('Tidak ada foto untuk boomerang.');
  if (!(await canEncodeMp4Fallback())) {
    throw new Error('Browser ini tidak mendukung pembuatan video MP4.');
  }

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const W = BOOMERANG_W;
  const H = BOOMERANG_H;
  const LOOPS = BOOMERANG_LOOPS;

  const imgs = await Promise.all(photos.map((u) => loadImage(u)));
  const order = boomerangOrder(photos.length);
  const totalFrames = order.length * LOOPS;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser ini.');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (err) {
        encodeError = err instanceof Error ? err : new Error('Muxing MP4 gagal.');
      }
    },
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error('Encoding MP4 gagal.');
    },
  });
  encoder.configure({
    codec: BOOMERANG_CODEC,
    width: W,
    height: H,
    bitrate: BOOMERANG_BITRATE,
    framerate: 2,
  });

  try {
    let drawn = 0;
    for (let loop = 0; loop < LOOPS; loop++) {
      for (const idx of order) {
        if (encodeError) throw encodeError;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        drawCover(ctx, imgs[idx], W, H);
        const timestamp = drawn * BOOMERANG_FRAME_US;
        const frame = new VideoFrame(canvas, { timestamp, duration: BOOMERANG_FRAME_US });
        try {
          // Keyframe di awal setiap loop agar hasil dapat di-seek dengan baik.
          encoder.encode(frame, { keyFrame: drawn % order.length === 0 });
        } finally {
          frame.close();
        }
        drawn += 1;
        onProgress?.(drawn, totalFrames);
      }
    }
    if (encodeError) throw encodeError;
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* abaikan */
    }
  }

  if (encodeError) throw encodeError;
  const buffer = muxer.target.buffer;
  if (!buffer || buffer.byteLength === 0) throw new Error('Hasil MP4 kosong.');
  return new Blob([buffer], { type: 'video/mp4' });
}
