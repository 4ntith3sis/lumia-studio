#!/usr/bin/env node
/**
 * Seed dummy frame LUMIA — SERVER-SIDE ONLY (node, bukan browser).
 *
 * Menambah 8 baris frames (2 varian × 4 kategori) dengan image_url
 * relatif ke public/frames/dummy/*.png. Idempoten: baris dengan
 * image_url yang sama dilewati (tidak ada duplikasi, hapus, atau
 * update data yang sudah ada).
 *
 * Service role key hanya dibaca dari environment di sini.
 * Cara pakai: npm run seed:dummy-frames
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve(process.cwd(), '.env.local');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const DUMMIES = [];
for (const count of [2, 3, 4, 6]) {
  for (const variant of ['black', 'white']) {
    const label = variant === 'black' ? 'Black' : 'White';
    DUMMIES.push({
      name: `Dummy ${label} ${count} Foto`,
      image_url: `/frames/dummy/dummy-${variant}-${count}.png`,
      photo_count: count,
      is_active: true,
    });
  }
}

async function main() {
  loadEnvFile(ENV_PATH);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceKey) {
    console.error('Config belum lengkap: isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: readError } = await supabase
    .from('frames')
    .select('image_url');
  if (readError) throw new Error(`Gagal membaca frames: ${readError.message}`);
  const have = new Set((existing ?? []).map((r) => r.image_url));

  let created = 0;
  let skipped = 0;
  for (const row of DUMMIES) {
    if (have.has(row.image_url)) {
      skipped += 1;
      continue;
    }
    const { error } = await supabase.from('frames').insert(row);
    if (error) throw new Error(`Gagal menambah ${row.name}: ${error.message}`);
    created += 1;
    console.log(`+ ${row.name}`);
  }
  console.log(`Selesai: ${created} ditambah, ${skipped} dilewati (sudah ada).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
