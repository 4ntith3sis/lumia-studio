import { computeSlots, clampAdjustToSlot, type PhotoAdjust } from '@/lib/photobooth/studio';
import { resolveFrameSlots, type SlotRect } from '@/lib/photobooth/frame-slots';
import type { EffectSettings, ValidPhotoCount } from '@/types';

export { computeSlots };

/**
 * Deteksi apakah browser benar-benar menerapkan CanvasRenderingContext2D.filter.
 * Menetapkan ctx.filter tidak pernah melempar — termasuk di Safari yang
 * mengabaikannya secara diam-diam — sehingga cek assignment saja tidak cukup.
 * Kita lakukan render test nyata sekali lalu cache hasilnya:
 * gambar 2px (merah + hijau), terapkan grayscale(100%), baca kembali pikselnya.
 * Jika kedua piksel menjadi abu-abu (R≈G≈B), filter didukung.
 */
let _canvasFilterSupported: boolean | null = null;
export function isCanvasFilterSupported(): boolean {
  if (_canvasFilterSupported !== null) return _canvasFilterSupported;
  try {
    if (typeof document === 'undefined') {
      _canvasFilterSupported = false;
      return false;
    }
    const src = document.createElement('canvas');
    src.width = 2;
    src.height = 1;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    const dst = document.createElement('canvas');
    dst.width = 2;
    dst.height = 1;
    const dctx = dst.getContext('2d', { willReadFrequently: true });
    if (!sctx || !dctx) {
      _canvasFilterSupported = false;
      return false;
    }
    sctx.fillStyle = '#ff0000';
    sctx.fillRect(0, 0, 1, 1);
    sctx.fillStyle = '#00ff00';
    sctx.fillRect(1, 0, 1, 1);
    dctx.filter = 'grayscale(100%)';
    dctx.drawImage(src, 0, 0);
    dctx.filter = 'none';
    const px = dctx.getImageData(0, 0, 2, 1).data;
    const gray0 = Math.abs(px[0] - px[1]) <= 2 && Math.abs(px[1] - px[2]) <= 2;
    const gray1 = Math.abs(px[4] - px[5]) <= 2 && Math.abs(px[5] - px[6]) <= 2;
    _canvasFilterSupported = gray0 && gray1;
    return _canvasFilterSupported;
  } catch {
    _canvasFilterSupported = false;
    return false;
  }
}

/* ─── Safari pixel fallback ───────────────────────────────
 * Menerapkan EffectSettings langsung pada ImageData dengan urutan
 * yang sama persis seperti settingsToCssFilter():
 * blur → brightness → contrast → grayscale → sepia →
 * saturate → hue-rotate → opacity.
 * Hanya dipakai bila ctx.filter native tidak tersedia/berfungsi;
 * Chrome & Safari modern tetap memakai path native (tanpa overhead).
 */

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [clamp255(r * 255), clamp255(g * 255), clamp255(b * 255)];
}

/** Box blur sederhana (radius integer) pada ImageData in-place. */
function boxBlurInPlace(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Uint8ClampedArray(data.length);
  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let as = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const sx = Math.min(w - 1, Math.max(0, x + k));
        const si = (y * w + sx) * 4;
        rs += data[si];
        gs += data[si + 1];
        bs += data[si + 2];
        as += data[si + 3];
        n++;
      }
      const di = (y * w + x) * 4;
      tmp[di] = rs / n;
      tmp[di + 1] = gs / n;
      tmp[di + 2] = bs / n;
      tmp[di + 3] = as / n;
    }
  }
  // Vertical pass (kembali ke data).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let as = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const sy = Math.min(h - 1, Math.max(0, y + k));
        const si = (sy * w + x) * 4;
        rs += tmp[si];
        gs += tmp[si + 1];
        bs += tmp[si + 2];
        as += tmp[si + 3];
        n++;
      }
      const di = (y * w + x) * 4;
      data[di] = rs / n;
      data[di + 1] = gs / n;
      data[di + 2] = bs / n;
      data[di + 3] = as / n;
    }
  }
}

/**
 * Terapkan EffectSettings pada ImageData (dipanggil pada canvas temporer
 * berukuran slot, sehingga frame tidak pernah ikut terproses).
 */
export function applyPixelEffect(imageData: ImageData, settings: EffectSettings): void {
  const { data } = imageData;
  const w = imageData.width;
  const h = imageData.height;

  // 1. blur (pre-pass agar setara ctx.filter yang mem-blur sebelum operasi lain).
  if (settings.blur > 0 && w > 1 && h > 1) {
    boxBlurInPlace(data, w, h, settings.blur);
  }

  const bMul = settings.brightness / 100;
  const cMul = settings.contrast / 100;
  const gAmt = Math.max(0, Math.min(100, settings.grayscale)) / 100;
  const sAmt = Math.max(0, Math.min(100, settings.sepia)) / 100;
  const satMul = settings.saturation / 100;
  const hueDeg = ((settings.hueRotate % 360) + 360) % 360;
  const oMul = Math.max(0, Math.min(100, settings.opacity)) / 100;

  const doBrightness = settings.brightness !== 100;
  const doContrast = settings.contrast !== 100;
  const doGrayscale = settings.grayscale > 0;
  const doSepia = settings.sepia > 0;
  const doSaturate = settings.saturation !== 100;
  const doHue = hueDeg !== 0;
  const doOpacity = settings.opacity !== 100;

  if (!doBrightness && !doContrast && !doGrayscale && !doSepia && !doSaturate && !doHue && !doOpacity) return;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];

    // 2. brightness
    if (doBrightness) {
      r *= bMul;
      g *= bMul;
      b *= bMul;
    }
    // 3. contrast
    if (doContrast) {
      r = (r - 128) * cMul + 128;
      g = (g - 128) * cMul + 128;
      b = (b - 128) * cMul + 128;
    }
    // 4. grayscale
    if (doGrayscale) {
      const y = luminance(r, g, b);
      r += (y - r) * gAmt;
      g += (y - g) * gAmt;
      b += (y - b) * gAmt;
    }
    // 5. sepia (matriks standar, di-blend sesuai intensitas)
    if (doSepia) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * sAmt;
      g += (sg - g) * sAmt;
      b += (sb - b) * sAmt;
    }
    // 6. saturate
    if (doSaturate) {
      const y = luminance(r, g, b);
      r = y + (r - y) * satMul;
      g = y + (g - y) * satMul;
      b = y + (b - y) * satMul;
    }
    // 7. hue-rotate
    if (doHue) {
      const [hh, ss, ll] = rgbToHsl(r, g, b);
      const [nr, ng, nb] = hslToRgb(((hh + hueDeg / 360) % 1 + 1) % 1, ss, ll);
      r = nr;
      g = ng;
      b = nb;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
    // 8. opacity
    data[i + 3] = doOpacity ? clamp255(a * oMul) : a;
  }
}

/**
 * Gambar satu foto slot memakai pixel fallback (untuk browser tanpa
 * ctx.filter native yang berfungsi). Foto digambar ke canvas temporer
 * berukuran slot, diproses per-piksel, lalu di-blit ke ctx utama
 * (yang sudah di-clip ke slot). Frame TIDAK pernah masuk ke sini.
 */
function drawPhotoPixelFallback(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: { x: number; y: number; w: number; h: number },
  cx: number,
  cy: number,
  dw: number,
  dh: number,
  settings: EffectSettings,
): void {
  const tw = Math.max(1, Math.round(slot.w));
  const th = Math.max(1, Math.round(slot.h));
  const tmp = document.createElement('canvas');
  tmp.width = tw;
  tmp.height = th;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!tctx) {
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    return;
  }
  // Samakan geometri cover-crop dengan path native (offset relatif slot).
  tctx.drawImage(img, cx - dw / 2 - slot.x, cy - dh / 2 - slot.y, dw, dh);
  try {
    const imageData = tctx.getImageData(0, 0, tw, th);
    applyPixelEffect(imageData, settings);
    tctx.putImageData(imageData, 0, 0);
  } catch {
    // Canvas tainted (CORS) — biarkan foto apa adanya tanpa filter
    // daripada menggagalkan seluruh render.
  }
  ctx.drawImage(tmp, slot.x, slot.y, slot.w, slot.h);
}

/**
 * Phase 6 — SATU-SATUNYA sumber logika compositing.
 * Dipakai oleh StudioCanvas (preview) dan export final, sehingga
 * hasil download dijamin identik dengan preview: posisi, skala,
 * crop, filter, ukuran frame, rasio, dan urutan layer sama.
 *
 * Urutan layer: 1. background → 2. foto user → 3. filter →
 * 4. frame PNG overlay (paling atas).
 */

export interface CompositeInput {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  count: ValidPhotoCount;
  /** Gambar foto per slot (null = slot kosong). */
  photoImgs: (HTMLImageElement | null)[];
  frameImg: HTMLImageElement | null;
  filterCss: string;
  /** Settings mentah untuk pixel fallback Safari (opsional). */
  effectSettings?: EffectSettings | null;
  adjustments: PhotoAdjust[];
  /**
   * Slot foto yang SUDAH diselesaikan (dari deteksi alpha frame).
   * Bila tidak diberikan, dipakai grid standar computeSlots().
   * Bila diberikan, panjangnya HARUS sama dengan count — jika tidak,
   * error dilempar agar tidak terjadi render tumpang tindih diam-diam.
   */
  slots?: SlotRect[];
}

// Dev-only: log pergantian filter agar mudah diverifikasi tanpa polling console.
let _lastLoggedFilter: string | null = null;
function debugEffectRender(filterCss: string, photosLoaded: number, w: number, h: number): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (filterCss === _lastLoggedFilter) return;
  _lastLoggedFilter = filterCss;
  console.debug('[LUMIA EFFECT RENDER]', {
    filterCss,
    canvasFilterSupported: isCanvasFilterSupported(),
    photosLoaded,
    canvas: `${w}x${h}`,
  });
}

export function drawComposite(input: CompositeInput): void {
  const { ctx, W, H, count, photoImgs, frameImg, filterCss, effectSettings, adjustments } = input;

  debugEffectRender(filterCss, photoImgs.filter(Boolean).length, W, H);

  // 1. Background.
  ctx.fillStyle = '#FDF5E6';
  ctx.fillRect(0, 0, W, H);

  // Slot foto: pakai hasil deteksi bila diberikan (sudah tervalidasi
  // 1 foto per slot oleh penelepon), selain itu grid standar.
  // Panjang yang salah = error keras, bukan fallback diam-diam.
  const slots = input.slots ?? computeSlots(count, W, H);
  if (slots.length !== count) {
    throw new Error(
      `Slot foto tidak valid: ditemukan ${slots.length} slot untuk ${count} foto. ` +
        'Pilih frame lain yang sesuai.',
    );
  }

  // 2–3. Foto + filter (di bawah frame).
  // Jalur native dipakai hanya bila browser TERBUKTI menerapkan ctx.filter
  // (render test, bukan sekadar assignment). Jika tidak, gunakan pixel
  // fallback dari effectSettings agar efek tetap terlihat nyata —
  // BUKAN degradasi diam-diam ke foto original.
  const useNative = filterCss !== 'none' && isCanvasFilterSupported();
  const usePixelFallback = !useNative && filterCss !== 'none' && !!effectSettings;

  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    const img = photoImgs[i];
    const raw = adjustments[i] ?? { dx: 0, dy: 0, zoom: 1 };

    if (!img) {
      ctx.fillStyle = 'rgba(30,30,30,0.06)';
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      ctx.fillStyle = '#6B7280';
      ctx.font = `800 ${Math.round(slot.h / 8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), slot.x + slot.w / 2, slot.y + slot.h / 2);
      ctx.textBaseline = 'alphabetic';
      continue;
    }

    // Cover + zoom + offset; dijepit dinamis agar slot selalu penuh.
    const adj = clampAdjustToSlot(raw, img.naturalWidth, img.naturalHeight, slot);
    const base = Math.max(slot.w / img.naturalWidth, slot.h / img.naturalHeight);
    const scale = base * adj.zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const cx = slot.x + slot.w / 2 + adj.dx;
    const cy = slot.y + slot.h / 2 + adj.dy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.w, slot.h);
    ctx.clip();
    if (usePixelFallback && effectSettings) {
      drawPhotoPixelFallback(ctx, img, slot, cx, cy, dw, dh, effectSettings);
    } else {
      ctx.filter = useNative ? filterCss : 'none';
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    }
    ctx.restore();
  }
  ctx.filter = 'none';

  // 4. Frame PNG overlay paling atas (tidak digeser/di-zoom).
  if (frameImg) {
    ctx.drawImage(frameImg, 0, 0, W, H);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error('Gambar tidak valid.'));
    };
    img.onerror = () => reject(new Error('Gambar gagal dimuat.'));
    img.src = url;
  });
}

export interface FinalRenderOptions {
  photos: string[];
  frameUrl: string | null;
  filterCss: string;
  /** Settings mentah untuk pixel fallback (diteruskan ke drawComposite). */
  effectSettings?: EffectSettings | null;
  adjustments: PhotoAdjust[];
  count: ValidPhotoCount;
  /** Lebar output; tinggi mengikuti rasio frame (default 1200). */
  width?: number;
}

/** Render komposit final pada resolusi export (bukan preview). */
export async function renderFinalCanvas(options: FinalRenderOptions): Promise<HTMLCanvasElement> {
  const { photos, frameUrl, filterCss, effectSettings, adjustments, count, width = 1200 } = options;

  const photoImgs = await Promise.all(
    Array.from({ length: count }, (_, i) => (photos[i] ? loadImage(photos[i]) : Promise.resolve(null)))
  );

  let frameImg: HTMLImageElement | null = null;
  let aspect = 3 / 4;
  if (frameUrl) {
    try {
      frameImg = await loadImage(frameUrl);
      aspect = frameImg.naturalWidth / frameImg.naturalHeight;
    } catch {
      frameImg = null;
    }
  }

  const W = width;
  // Tinggi mengikuti rasio asli frame TANPA clamp agar tidak ada distorsi
  // pada frame apa pun (portrait, landscape, square, custom). Skala display
  // responsif tidak memengaruhi export: ini koordinat resolusi penuh.
  const H = Math.max(1, Math.round(width / aspect));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser ini.');

  // Selesaikan slot dari frame aktual agar export identik dengan preview.
  // Tanpa frame → grid standar. Deteksi gagal → lempar error deskriptif
  // (ditangkap penelepon menjadi pesan UI), bukan grid yang mismatch.
  let slots: SlotRect[] | undefined;
  if (frameUrl && frameImg) {
    const res = resolveFrameSlots({ frameImg, frameKey: frameUrl, count, W, H });
    if (!res.ok) throw new Error(res.message);
    slots = res.slots;
  }

  drawComposite({ ctx, W, H, count, photoImgs, frameImg, filterCss, effectSettings, adjustments, slots });
  return canvas;
}

/** Urutan frame boomerang: maju 1..N lalu mundur N-1..2 (tanpa duplikat ujung). */
export function boomerangOrder(count: number): number[] {
  const order: number[] = [];
  for (let i = 0; i < count; i++) order.push(i);
  for (let i = count - 2; i >= 1; i--) order.push(i);
  return order;
}
