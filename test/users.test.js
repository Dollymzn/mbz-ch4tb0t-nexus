'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');

function fresh(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-users-'));
  process.env.DATA_DIR = dir;
  ['MASTER_USER', 'MASTER_PASSWORD', 'ACCESS_PASSWORD'].forEach(k => delete process.env[k]);
  Object.assign(process.env, env || {});
  ['../lib/datadir', '../lib/users', '../lib/blogs'].forEach(m => delete require.cache[require.resolve(m)]);
  return { users: require('../lib/users'), blogs: require('../lib/blogs') };
}

test('users — bootstrap por env, login, token, papéis, troca de senha invalida sessões', () => {
  const { users } = fresh({ MASTER_USER: 'Teteu', MASTER_PASSWORD: 'segredo1' });
  assert.deepEqual(users.bootstrap(), { created: true, mode: 'env' });
  assert.equal(users.listUsers()[0].name, 'teteu');
  assert.equal(users.login('teteu', 'errada'), null);
  const r = users.login('TETEU', 'segredo1');
  assert.ok(r && r.token && r.user.role === 'master');
  assert.equal(users.verifyToken(r.token).name, 'teteu');
  assert.equal(users.verifyToken(r.token + 'x'), null);
  const g = users.createUser({ name: 'ana', password: 'ana123', role: 'gestor' });
  assert.equal(g.role, 'gestor');
  assert.throws(() => users.createUser({ name: 'ana', password: 'ana123' }), /já existe/);
  assert.throws(() => users.createUser({ name: 'x', password: '123' }), /6\+/);
  const t1 = users.login('ana', 'ana123').token;
  users.setPassword(g.id, 'nova123');
  assert.equal(users.verifyToken(t1), null, 'senha trocada → token antigo cai');
  assert.ok(users.login('ana', 'nova123'));
  users.setActive(g.id, false);
  assert.equal(users.login('ana', 'nova123'), null, 'desativado não entra');
  assert.throws(() => users.setActive(users.masterId(), false), /master/);
});

test('users — legado ACCESS_PASSWORD vira master "master"; first-run: primeiro login cria o master', () => {
  const a = fresh({ ACCESS_PASSWORD: 'antiga1' });
  assert.equal(a.users.bootstrap().mode, 'legacy');
  assert.ok(a.users.login('master', 'antiga1'));
  const b = fresh({});
  assert.equal(b.users.bootstrap().mode, 'first-run');
  assert.ok(b.users.isFirstRun());
  const r = b.users.login('teteu', 'primeira1');
  assert.ok(r && r.user.role === 'master');
  assert.equal(b.users.login('outro', 'qualquer1'), null, 'depois do primeiro, não cria mais');
});

test('blogs — owner: addBlog grava dono, claimOrphans migra, backup/restore por dono', () => {
  const { blogs } = fresh({});
  const b1 = blogs.addBlog({ name: 'A', url: 'https://a.com', user: 'u', appPassword: 'pw' });
  assert.equal(b1.owner, null);
  assert.equal(blogs.claimOrphans('M'), 1);
  assert.equal(blogs.getBlogOwner(b1.id), 'M');
  const b2 = blogs.addBlog({ name: 'B', url: 'https://b.com', user: 'u', appPassword: 'pw' }, 'G');
  assert.equal(b2.owner, 'G');
  assert.equal(blogs.exportBackup('G').length, 1);
  assert.equal(blogs.exportBackup(null).length, 2);
  blogs.removeBlog(b2.id);
  const r = blogs.importBackup(blogs.exportBackup(null).concat([{ url: 'https://c.com', user: 'u', secret: blogs.encrypt('x') }]), 'G');
  assert.equal(r.added, 1);
  assert.equal(blogs.getBlogOwner(blogs.listBlogs().find(b => b.url === 'https://c.com').id), 'G');
});

test('users — bootstrap aceita senha curta do ambiente (legado) e nunca lança', () => {
  const a = fresh({ ACCESS_PASSWORD: 'abc' });
  assert.equal(a.users.bootstrap().mode, 'legacy');
  assert.ok(a.users.login('master', 'abc'), 'entra com a senha curta');
  const b = fresh({ MASTER_USER: '!!!', MASTER_PASSWORD: 'x' });
  assert.equal(b.users.bootstrap().mode, 'first-run', 'nome inválido → first-run, sem crash');
});

test('users — MASTER_* manda sempre: cria o master mesmo com users.json existente e re-sincroniza a senha', () => {
  const a = fresh({ ACCESS_PASSWORD: 'abc' });
  assert.equal(a.users.bootstrap().mode, 'legacy');
  process.env.MASTER_USER = 'teteu'; process.env.MASTER_PASSWORD = 'nova123';
  assert.equal(a.users.bootstrap().mode, 'env+users');
  assert.ok(a.users.login('teteu', 'nova123') && a.users.login('master', 'abc'), 'os dois masters entram');
  process.env.MASTER_PASSWORD = 'outra123';
  assert.equal(a.users.bootstrap().mode, 'env-sync');
  assert.equal(a.users.login('teteu', 'nova123'), null); assert.ok(a.users.login('teteu', 'outra123'));
  assert.equal(a.users.bootstrap().mode, 'users', 'sem mudança → nada a fazer');
});

test('blogs — setOwner transfere o blog', () => {
  const { blogs } = fresh({});
  const b = blogs.addBlog({ name: 'A', url: 'https://a.com', user: 'u', appPassword: 'pw' }, 'M');
  assert.equal(blogs.setOwner(b.id, 'G').owner, 'G');
  assert.equal(blogs.getBlogOwner(b.id), 'G');
  assert.throws(() => blogs.setOwner('nope', 'G'), /não encontrado/);
});
