import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import imageHandler from '../api/pin-images.js';
import pinsHandler from '../api/map-pins.js';
import { createSession } from '../api/campaign-access.js';

let server, origin, directory, fixture, uploaded, pin;
const secret = 'pin-image-test-secret-with-at-least-32-characters';
const request = (path, method = 'GET', role = 'admin', body, headers = {}) => fetch(`${origin}${path}`, { method, headers: { ...(role ? { Cookie: `dioos_imortais=${createSession(secret, role)}` } : {}), 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dioos-images-test-'));
  process.env.PIN_DATA_FILE = join(directory, 'pins.json'); process.env.SESSION_SECRET = secret;
  delete process.env.DATABASE_URL; delete process.env.VERCEL;
  fixture = { name: 'Teste da galeria.png', data: (await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#c6ad77' } }).png().toBuffer()).toString('base64') };
  server = createServer((req, res) => req.url.startsWith('/api/pin-images') ? imageHandler(req, res) : pinsHandler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  assert.ok(relative(resolve(tmpdir()), resolve(directory)).startsWith('dioos-images-test-'));
  await rm(directory, { recursive: true, force: true });
});
test('image upload requires admin session and same origin', async () => {
  assert.equal((await request('/api/pin-images', 'POST', null, fixture)).status, 401);
  assert.equal((await request('/api/pin-images', 'POST', 'player', fixture)).status, 403);
  assert.equal((await request('/api/pin-images', 'POST', 'admin', fixture, { Origin: 'https://other.example' })).status, 403);
});
test('invalid files, SVG and broken content are rejected', async () => {
  for (const data of ['not base64', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'), Buffer.from('this is not an image').toString('base64')]) {
    assert.equal((await request('/api/pin-images', 'POST', 'admin', { name: 'disfarce.png', data })).status, 400);
  }
  assert.equal((await request('/api/pin-images?id=../../secret', 'GET')).status, 404);
});
test('uploaded images are optimized and private until their pin is saved', async () => {
  const response = await request('/api/pin-images', 'POST', 'admin', fixture);
  assert.equal(response.status, 201); uploaded = (await response.json()).image;
  assert.equal(uploaded.width, 1600); assert.equal(uploaded.height, 800);
  const path = `/api/pin-images?id=${uploaded.id}`;
  assert.equal((await request(path, 'GET', null)).status, 401);
  assert.equal((await request(path, 'GET', 'player')).status, 404);
  const image = await request(path);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  const decoded = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(decoded.width, 1600); assert.equal(decoded.format, 'webp');
});
test('published pins expose gallery metadata and images to players, not embedded image data', async () => {
  const body = { id: randomUUID(), title: 'Galeria temporária', description: '', category: 'places', icon: 'landmark', shape: 'marker', color: '#d6bd8e', x: .4, y: .6, images: [{ ...uploaded, name: 'forged', data: 'not allowed' }] };
  const response = await request('/api/map-pins', 'POST', 'admin', body);
  assert.equal(response.status, 201); pin = (await response.json()).pin;
  assert.deepEqual(pin.images, [uploaded]);
  const list = await (await request('/api/map-pins', 'GET', 'player')).json();
  assert.deepEqual(list.pins[0].images, [uploaded]);
  assert.equal((await request(`/api/pin-images?id=${uploaded.id}`, 'GET', 'player')).status, 200);
  const head = await request(`/api/pin-images?id=${uploaded.id}`, 'HEAD', 'player');
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
});
test('unknown, duplicate or excessive image references cannot be published', async () => {
  for (const images of [[{ id: randomUUID() }], [uploaded, uploaded], Array.from({ length: 7 }, () => ({ id: randomUUID() })), [{ id: 'https://other.example/image.png' }]]) {
    assert.equal((await request('/api/map-pins', 'PATCH', 'admin', { ...pin, images })).status, 400);
  }
  assert.equal((await request('/api/map-pins', 'PATCH', 'player', { ...pin, images: [] })).status, 403);
});
test('detaching an image revokes player access while retaining the admin copy', async () => {
  const response = await request('/api/map-pins', 'PATCH', 'admin', { ...pin, images: [] });
  assert.equal(response.status, 200); pin = (await response.json()).pin;
  assert.deepEqual(pin.images, []);
  assert.equal((await request(`/api/pin-images?id=${uploaded.id}`, 'GET', 'player')).status, 404);
  assert.equal((await request(`/api/pin-images?id=${uploaded.id}`)).status, 200);
});
test('images have no ephemeral disk fallback in Vercel', async () => {
  process.env.VERCEL = '1';
  try { assert.equal((await request('/api/pin-images', 'POST', 'admin', fixture)).status, 503); }
  finally { delete process.env.VERCEL; }
});
