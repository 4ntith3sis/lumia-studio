#!/usr/bin/env node
/**
 * Bootstrap admin satu kali — SERVER-SIDE ONLY.
 *
 * Membuat user Supabase Auth (jika belum ada) + baris profiles
 * dengan is_admin = true, tanpa Supabase Dashboard.
 *
 * - JANGAN diimpor ke kode browser / Client Component.
 * - Service role key hanya dibaca dari environment di sini.
 * - Password TIDAK disimpan di file ini: diminta via input terminal
 *   tersembunyi (atau via env BOOTSTRAP_ADMIN_PASSWORD untuk mode
 *   non-interaktif). Nilai secret tidak pernah dicetak ke log.
 *
 * Cara pakai:  npm run bootstrap:admin
 */

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve(process.cwd(), '.env.local');

/* ─── Baca .env.local manual (tanpa dependensi tambahan) ─── */
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
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

/* ─── Prompt terminal ─── */
function prompt(query, def = '') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = def ? ` [${def}]` : '';
  return new Promise((res) =>
    rl.question(`${query}${hint}: `, (ans) => {
      rl.close();
      res(ans.trim() || def);
    })
  );
}

/* Input password tersembunyi (diganti * saat diketik). */
function promptHidden(query) {
  return new Promise((res) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let input = '';
    stdout.write(`${query}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        done();
      } else if (ch === '\u0003') {
        stdout.write('\nDibatalkan.\n');
        process.exit(1);
      } else if (ch === '\u007f' || ch === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          stdout.write('\b \b');
        }
      } else {
        input += ch;
        stdout.write('*');
      }
    };
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      res(input);
    };
    stdin.on('data', onData);
  });
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '';
}

/* ─── Main ─── */
async function main() {
  loadEnvFile(ENV_PATH);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !serviceKey) {
    console.error(
      'Config belum lengkap. Isi di .env.local (JANGAN commit — .env* sudah di .gitignore):\n' +
        '  NEXT_PUBLIC_SUPABASE_URL=<project-url>\n' +
        '  SUPABASE_SERVICE_ROLE_KEY=<service-role-key dari Dashboard → Project Settings → API>\n' +
        'Hanya SUPABASE_SERVICE_ROLE_KEY yang tambahan; runtime app tetap tanpa service role.'
    );
    process.exit(1);
  }

  const email =
    argValue('--email') || process.env.BOOTSTRAP_ADMIN_EMAIL || (await prompt('Email admin', 'admin@lumia.com'));
  let password = argValue('--password') || process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!password) password = await promptHidden('Password admin (input tersembunyi)');
  if (password.length < 6) {
    console.error('Password minimal 6 karakter.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* 1. Cari user yang sudah ada (hindari duplikasi) */
  let userId = '';
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Gagal membaca daftar user: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      userId = found.id;
      console.log(`User Auth sudah ada (${email}).`);
      break;
    }
    if (data.users.length < 100) break;
    page += 1;
  }

  /* 2. Buat user Auth jika belum ada */
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Gagal membuat user Auth: ${error.message}`);
    userId = data.user.id;
    console.log(`User Auth dibuat (${email}).`);
  }

  /* 3. Pastikan profiles.is_admin = true */
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
  if (profile?.is_admin === true) {
    console.log('profiles.is_admin sudah true. Tidak ada perubahan.');
    return;
  }
  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, is_admin: true }, { onConflict: 'id' });
  if (upsertError) throw new Error(`Gagal menulis profiles: ${upsertError.message}`);

  console.log('Bootstrap selesai: login di /admin/login dengan email tersebut.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
