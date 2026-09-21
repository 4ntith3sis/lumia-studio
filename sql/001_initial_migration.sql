-- ============================================================
-- LUMIA PHOTOBOOTH — Supabase Migration (Phase 2)
-- Jalankan SQL ini di Supabase SQL Editor
-- ============================================================

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Profiles table (extends auth.users via trigger)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Frames table
create table if not exists public.frames (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  image_url   text not null,
  photo_count integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint frames_photo_count_check check (photo_count in (2, 3, 4, 6))
);

-- 4. Indexes
create index if not exists frames_photo_count_idx on public.frames(photo_count);
create index if not exists frames_is_active_idx  on public.frames(is_active) where is_active = true;

-- 5. Trigger: set updated_at automatically
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists handle_frames_updated_at on public.frames;
create trigger handle_frames_updated_at
  before update on public.frames
  for each row execute procedure public.handle_updated_at();

drop trigger if exists handle_profiles_updated_at on public.profiles;
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- 6. RLS: enable on both tables
alter table public.frames    enable row level security;
alter table public.profiles  enable row level security;

-- 7. RLS Policies — frames
-- 7a. Public can read only active frames
drop policy if exists "public_read_active_frames" on public.frames;
create policy "public_read_active_frames"
  on public.frames for select
  using (is_active = true);

-- 7b. Admin can do everything on frames (RLS adalah penegakan utama;
-- client memakai anon key + session user, tanpa service role dari browser)
drop policy if exists "admin_full_frames" on public.frames;
create policy "admin_full_frames"
  on public.frames for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- 8. RLS Policies — profiles
-- 8a. Users can read their own profile
drop policy if exists "users_read_own_profile" on public.profiles;
create policy "users_read_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 8b. Authenticated users can insert their own profile (on signup)
drop policy if exists "users_insert_own_profile" on public.profiles;
create policy "users_insert_own_profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 8c. Users can update their own profile (tapi TIDAK boleh menaikkan
-- diri sendiri menjadi admin — dicegah trigger prevent_is_admin_escalation)
drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 8d. Cegah privilege escalation: hanya admin (atau bootstrap saat
-- belum ada admin sama sekali) yang boleh mengubah kolom is_admin
create or replace function public.prevent_is_admin_escalation()
returns trigger as $$
declare
  admin_count integer;
  caller_is_admin boolean;
begin
  if new.is_admin is distinct from old.is_admin then
    select count(*) into admin_count from public.profiles where is_admin = true;
    select exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    ) into caller_is_admin;
    if admin_count > 0 and not caller_is_admin then
      raise exception 'Hanya admin yang dapat mengubah status admin.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists prevent_is_admin_escalation on public.profiles;
create trigger prevent_is_admin_escalation
  before update of is_admin on public.profiles
  for each row execute procedure public.prevent_is_admin_escalation();

-- 9. Storage bucket setup (idempotent — aman dijalankan ulang,
-- tidak menghapus bucket atau file yang sudah ada)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frame-images', 'frame-images', true, 5242880, array['image/png']::text[])
on conflict (id) do nothing;
-- Catatan: jika bucket sudah ada tapi belum Public, aktifkan Public di
-- Dashboard → Storage → frame-images → Settings (diperlukan agar
-- getPublicUrl dapat diakses browser). Batas 5 MB & PNG-only untuk
-- bucket yang sudah ada tidak diubah oleh statement di atas.

-- 9a. Allow anonymous read on frame-images bucket
drop policy if exists "allow_public_read_frame_images" on storage.objects;
create policy "allow_public_read_frame_images"
  on storage.objects for select
  using (bucket_id = 'frame-images');

-- 9b. Hanya admin yang dapat mengunggah ke frame-images
-- (sebelumnya: semua user authenticated — dipersempit agar konsisten
-- dengan "hanya profiles.is_admin = true yang dapat mengelola frame")
drop policy if exists "allow_auth_insert_frame_images" on storage.objects;
drop policy if exists "allow_admin_insert_frame_images" on storage.objects;
create policy "allow_admin_insert_frame_images"
  on storage.objects for insert
  with check (
    bucket_id = 'frame-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- 9c. Only admin can update/delete frame images
drop policy if exists "allow_admin_write_frame_images" on storage.objects;
create policy "allow_admin_write_frame_images"
  on storage.objects for all
  using (
    bucket_id = 'frame-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    bucket_id = 'frame-images'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- 10. Grant schema usage
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;
