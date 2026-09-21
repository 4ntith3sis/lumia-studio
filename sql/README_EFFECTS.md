# SQL Migration — Effects

## Status saat ini
Tabel `public.effects` **belum ada** di database Supabase. Halaman `/admin/effects` menampilkan error:

> Failed to fetch effects: Could not find the table 'publicEffects' in the schema cache

## Langkah perbaikan
Jalankan seluruh isi file ini di Supabase Dashboard → SQL Editor:

```bash
cat sql/002_effects_migration.sql
```

atau copy-paste isi file `sql/002_effects_migration.sql`.

Setelah dijalankan:
- Tabel `public.effects` akan dibuat.
- 7 efek default (Normal, Vintage Warm, Monochrome, Soft Pastel, Cyber Neon, Retro Sepia, Vibrant Pop) akan disisipkan.
- RLS policy admin/publik akan diterapkan.
- Table cache Supabase otomatis diperbarui (tidak perlu restart service).

## Verifikasi pasca-migration
```bash
# Dari Supabase SQL Editor
SELECT count(*) FROM public.effects;
-- Harusnya 7
```

Lalu refresh `/admin/effects` — daftar efek harus muncul tanpa error.

## File yang sudah disiapkan
- `sql/002_effects_migration.sql` — migration idempotent (CREATE IF NOT EXISTS, ON CONFLICT DO NOTHING).
- `lib/services/effect.service.ts` — service CRUD client-safe (anon untuk read aktif, admin guard untuk write).
- `app/admin/effects/page.tsx` — UI CRUD lengkap.
- `types/index.ts` — type Effect & EffectInsert.

## Kalau tabel SUDAH ada
Query ini akan mengembalikan data; kalau tetap PGRST205 setelah migration dijalankan, pastikan schema cache refresh dengan menjalankan ulang migration sekali lagi (idempotent, aman).
