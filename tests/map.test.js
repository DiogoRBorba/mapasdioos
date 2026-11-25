import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pinsHandler from '../api/map-pins.js';
import imageHandler from '../api/map-image.js';
import { createSession } from '../api/campaign-access.js';

let server, origin, directory;
const secret = 'test-only-map-secret-with-more-than-32-characters';
const fixture = () => ({ id: randomUUID(), title: 'Pin de teste', description: '', category: 'places', icon: 'landmark', shape: 'marker', color: '#d6bd8e', x: .4, y: .6 });
const cookie = role => `dioos_imortais=${createSession(secret, role)}`;
const request = (method = 'GET', role = 'admin', body, headers = {}) => fetch(`${origin}/api/map-pins`, { method, headers: { ...(role ? { Cookie: cookie(role) } : {}), 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dioos-map-test-'));
  process.env.PIN_DATA_FILE = join(directory, 'pins.json');
  process.env.SESSION_SECRET = secret;
  delete process.env.DATABASE_URL; delete process.env.VERCEL;
  server = createServer((req, res) => req.url.startsWith('/api/map-image') ? imageHandler(req, res) : pinsHandler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });

test('map starts empty and requires a valid campaign session', async () => {
  assert.equal((await request('GET', null)).status, 401);
  assert.equal((await request('POST', null, fixture())).status, 401);
  const response = await request('GET', 'player');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pins: [] });
});

test('the map image is served only to authenticated viewers', async () => {
  assert.equal((await fetch(`${origin}/api/map-image`)).status, 401);
  const response = await fetch(`${origin}/api/map-image`, { headers: { Cookie: cookie('player') } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok((await response.arrayBuffer()).byteLength > 1000);
  const original = await fetch(`${origin}/api/map-image?quality=original`, { headers: { Cookie: cookie('player') } });
  assert.equal(original.headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(`${origin}/api/map-image?quality=original`)).status, 401);
});

test('players cannot create, edit or delete even with an admin role in the body', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request(method, 'player', { ...fixture(), role: 'admin', revision: 1 })).status, 403);
  assert.deepEqual((await (await request('GET')).json()).pins, []);
});

test('admin creates and edits a persistent pin; players see the same data', async () => {
  const draft = { ...fixture(), description: '<script>test</script>\nDescrição em texto puro.' };
  const created = await request('POST', 'admin', draft);
  assert.equal(created.status, 201);
  const { pin } = await created.json();
  assert.equal(pin.revision, 1);
  const persisted = JSON.parse(await readFile(process.env.PIN_DATA_FILE, 'utf8'));
  assert.deepEqual(persisted.pins[0], pin);
  assert.equal((await request('POST', 'admin', draft)).status, 409);
  const updated = await request('PATCH', 'admin', { ...pin, title: 'Novo título', category: 'memories', x: .75, y: .25, color: '#a997cb', shape: 'diamond', icon: 'book' });
  assert.equal(updated.status, 200);
  const next = (await updated.json()).pin;
  const viewed = (await (await request('GET', 'player')).json()).pins[0];
  assert.deepEqual(viewed, next);
  assert.equal(viewed.revision, 2);
  assert.equal(viewed.description, draft.description);
  assert.equal((await request('PATCH', 'admin', { ...pin, title: 'Edição antiga' })).status, 409);
  assert.equal((await request('DELETE', 'admin', { id: pin.id, revision: 1 })).status, 409);
  assert.equal((await request('DELETE', 'admin', { id: next.id, revision: next.revision })).status, 200);
  assert.deepEqual((await (await request('GET', 'player')).json()).pins, []);
  assert.equal(JSON.parse(await readFile(process.env.PIN_DATA_FILE, 'utf8')).pins[0].deleted, true);
});

test('invalid coordinates, fields and cross-origin writes are rejected', async () => {
  for (const fields of [{ x: -1 }, { y: 1.01 }, { x: null }, { title: ' ' }, { description: 'a'.repeat(4001) }, { category: 'secret' }, { icon: '<script>' }, { shape: 'unknown' }, { color: 'url(http://example.com)' }]) {
    assert.equal((await request('POST', 'admin', { ...fixture(), ...fields })).status, 400);
  }
  assert.equal((await request('POST', 'admin', fixture(), { Origin: 'https://another.example' })).status, 403);
  assert.equal((await request('PUT', 'admin', fixture())).status, 405);
  assert.deepEqual((await (await request()).json()).pins, []);
});

test('concurrent local saves preserve every pin', async () => {
  const drafts = Array.from({ length: 5 }, fixture);
  const responses = await Promise.all(drafts.map(draft => request('POST', 'admin', draft)));
  assert.ok(responses.every(response => response.status === 201));
  const pins = (await (await request()).json()).pins;
  assert.equal(pins.length, 5);
  assert.equal(new Set(pins.map(pin => pin.id)).size, 5);
});

test('Vercel refuses local-file fallback when the database is unconfigured', async () => {
  process.env.VERCEL = '1';
  try { assert.equal((await request()).status, 503); assert.equal((await request('POST', 'admin', fixture())).status, 503); }
  finally { delete process.env.VERCEL; }
});
