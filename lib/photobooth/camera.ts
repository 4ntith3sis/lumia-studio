/**
 * Helper kamera terpusat (client-side).
 * Satu-satunya tempat memanggil getUserMedia / menghentikan track,
 * dipakai route /take-foto. Tidak ada akses kamera di halaman lain.
 */

export function mapCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') {
    return 'Izin kamera ditolak. Aktifkan izin kamera di browser, lalu coba lagi.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Kamera tidak tersedia di perangkat ini.';
  }
  if (name === 'NotReadableError') {
    return 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut, lalu coba lagi.';
  }
  if (name === 'SecurityError') {
    return 'Akses kamera diblokir (konteks tidak aman). Gunakan HTTPS atau localhost.';
  }
  return 'Stream kamera gagal dimulai. Periksa perangkat kamera, lalu coba lagi.';
}

function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Minta stream kamera dan pasang ke elemen video.
 * Melempar Error dengan pesan Indonesia yang siap tampil.
 * Penelepon wajib menghentikan stream via stopCameraStream.
 */
export async function startCameraStream(
  video: HTMLVideoElement | null
): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error('Browser ini tidak mendukung akses kamera. Gunakan browser modern versi terbaru.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    throw new Error(mapCameraError(err));
  }
  if (video) {
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* autoplay ditolak browser — shutter tetap bisa dipakai */
    }
  }
  return stream;
}

/** Hentikan seluruh track dan lepas dari elemen video. Idempoten. */
export function stopCameraStream(
  stream: MediaStream | null,
  video: HTMLVideoElement | null
): void {
  try {
    stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* abaikan track yang sudah berhenti */
      }
    });
  } catch {
    /* abaikan */
  }
  try {
    if (video) video.srcObject = null;
  } catch {
    /* abaikan */
  }
}
