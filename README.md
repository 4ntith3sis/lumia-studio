# Lumia Photobooth

Photobooth web app berbasis Next.js + Supabase. User dapat mengambil foto via kamera, memilih frame dan filter, lalu mengunduh hasil akhir dalam format PNG atau boomerang (WebM).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + custom CSS variables
- **Database & Auth:** Supabase (PostgreSQL + RLS)
- **Storage:** Supabase Storage (`frame-images` bucket, PNG only, max 5 MB)
- **Kamera:** MediaDevices API (`getUserMedia`)

## Fitur Utama

| Fitur | Detail |
|-------|--------|
| Pilih jumlah foto | 2, 3, 4, atau 6 pose |
| Kamera & countdown | Mirror selfie, 3-2-1 countdown, capture otomatis |
| Review hasil | Galeri foto asli sebelum masuk Studio |
| Studio editor | Drag, zoom, reset per slot; pilih frame overlay & filter efek |
| Filter effects | 7 built-in preset + custom effects dari Admin panel |
| Export | Download original JPEG, framed composite PNG, boomerang WebM |
| Admin panel | CRUD frames (upload PNG) & effects (slider pengaturan) |
| Session management | Semua state di `sessionStorage`, aman saat refresh |

## Alur Pengguna

```
/                    → Home
/jumlah-foto         → Pilih jumlah foto (2/3/4/6)
/mulai-foto          → Persiapan sebelum kamera
/take-foto           → Kamera live + countdown + capture
/hasil-foto          → Review hasil foto
/studio              → Pilih frame & filter, atur posisi/zoom
/hasil-akhir         → Download hasil final
/admin               → Admin dashboard (butuh login)
/admin/login         → Autentikasi admin
/admin/frames        → Kelola semua kategori frame
/admin/effects       → Kelola effects / filter
```

## Instalasi

### 1. Clone & install dependencies

```bash
git clone https://github.com/4ntith3sis/lumia-studio.git
cd lumia-studio
npm install
```

### 2. Setup Supabase

Buat project baru di [Supabase Dashboard](https://supabase.com), lalu jalankan migration SQL berikut di **SQL Editor**:

```
sql/001_initial_migration.sql   — tabel profiles, frames, RLS policies, storage bucket
sql/002_effects_migration.sql   — tabel effects + 7 default effect preset
sql/003_effects_settings_migration.sql  — tambah kolom settings JSONB ke tabel effects
```

### 3. Konfigurasi environment

Salin template dan isi dengan kredensial Supabase kamu:

```bash
cp .env.example .env.local
```

Isi variabel berikut di `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Bootstrap admin (sekali saja)

Jalankan script ini di terminal untuk membuat user admin pertama:

```bash
npm run bootstrap:admin
```

Ikuti petunjuk di terminal untuk memasukkan email dan password admin.

### 5. Seed dummy frames (opsional)

Untuk testing cepat, tambahkan frame contoh:

```bash
npm run seed:dummy-frames
```

### 6. Jalankan development server

```bash
npm run dev
```

Buka http://localhost:3000 di browser.

## Script npm

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Start development server (localhost:3000) |
| `npm run build` | Build production |
| `npm start` | Jalankan production build |
| `npm run lint` | ESLint check |
| `npm run bootstrap:admin` | Buat user admin pertama di Supabase |
| `npm run seed:dummy-frames` | Isi database dengan frame contoh |

## Struktur Project

```
app/                  # Next.js App Router pages
  page.tsx            # Home
  studio/page.tsx     # Editor frame & filter
  take-foto/page.tsx  # Kamera
  ...
components/
  screens/            # Screen components (HomeScreen, StudioScreen, dll)
  studio/             # StudioCanvas, EffectThumbnail
  admin/              # AdminLayout, EffectSliderEditor, FrameManager
  photobooth/         # FrameCard, FrameGallery
lib/
  photobooth/         # Camera, capture, compositing, export, session, effect utils
  services/           # Supabase service layer (effects, frames)
  supabase/           # Client & server Supabase client setup
types/                # TypeScript type definitions
sql/                  # Database migration scripts (tidak di-commit ke git)
public/
  design-assets/      # Asset statis (illustrasi)
scripts/              # Bootstrap & seed utilities
.env.example          # Template environment variables
```

## Kontribusi

1. Fork repository
2. Buat branch fitur (`git checkout -b feature/nama-fitur`)
3. Commit perubahan (`git commit -m 'feat: deskripsi'`)
4. Push ke branch (`git push origin feature/nama-fitur`)
5. Buka Pull Request

## Lisensi

Private project — semua hak dilindungi.
