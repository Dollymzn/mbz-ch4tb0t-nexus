'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshBlogs() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-blogs-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../lib/datadir')];
  delete require.cache[require.resolve('../lib/blogs')];
  return require('../lib/blogs');
}

test('blogs — addBlog cifra a senha, listBlogs não expõe, getBlogCredentials decifra, upsert por url+user', () => {
  const b = freshBlogs();
  const r = b.addBlog({ name: 'Miaw', url: 'https://blog.miawzy.com/wp-admin/', user: 'Nexus', appPassword: 'aaaa  bbbb' });
  assert.equal(r.url, 'https://blog.miawzy.com');
  const raw = fs.readFileSync(b.BLOGS_FILE, 'utf8');
  assert.ok(!raw.includes('aaaa bbbb') && /"secret": ?"v1:/.test(raw));
  assert.ok(!('secret' in b.listBlogs()[0]) && !('appPassword' in b.listBlogs()[0]));
  assert.equal(b.getBlogCredentials(r.id).appPassword, 'aaaa bbbb');
  b.addBlog({ name: 'Miaw2', url: 'https://blog.miawzy.com', user: 'Nexus', appPassword: 'cccc' });
  assert.equal(b.listBlogs().length, 1, 'mesmo url+user atualiza em vez de duplicar');
});

test('datadir — DATA_DIR > RAILWAY_VOLUME_MOUNT_PATH > ./data (efêmero no Railway)', () => {
  const load = () => { delete require.cache[require.resolve('../lib/datadir')]; return require('../lib/datadir').storageInfo(); };
  const env = Object.assign({}, process.env);
  delete process.env.DATA_DIR; delete process.env.RAILWAY_VOLUME_MOUNT_PATH; delete process.env.RAILWAY_ENVIRONMENT; delete process.env.RAILWAY_PROJECT_ID;
  assert.equal(load().source, 'local');
  process.env.RAILWAY_ENVIRONMENT = 'production';
  assert.deepEqual([load().source, load().persistent], ['local', false]);
  process.env.RAILWAY_VOLUME_MOUNT_PATH = '/data';
  assert.deepEqual([load().dir, load().source, load().persistent], ['/data', 'railway-volume', true]);
  process.env.DATA_DIR = '/custom';
  assert.deepEqual([load().dir, load().source], ['/custom', 'DATA_DIR']);
  process.env = env;
});

test('v4.1.1 — backup/restore: blob leva a senha cifrada, restaura só o que falta e rejeita segredo inválido', () => {
  const b = freshBlogs();
  b.addBlog({ name: 'Miaw', url: 'https://blog.miawzy.com', user: 'Nexus', appPassword: 'aaaa bbbb' });
  const bk = b.exportBackup();
  assert.equal(bk.length, 1);
  assert.ok(/^v1:/.test(bk[0].secret) && !JSON.stringify(bk).includes('aaaa bbbb'), 'senha nunca em claro no backup');
  b.removeBlog(bk[0].id);
  assert.equal(b.listBlogs().length, 0);
  const r = b.importBackup(bk.concat([{ url: 'https://x.com', user: 'u', secret: 'v1:AAAA:BBBB:CCCC' }]));
  assert.deepEqual([r.added, r.invalid], [1, 1]);
  assert.equal(b.getBlogCredentials(bk[0].id).appPassword, 'aaaa bbbb');
  assert.equal(b.importBackup(bk).added, 0, 'não duplica');
});
