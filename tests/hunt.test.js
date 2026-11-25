import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import stateHandler from '../api/map-state.js';
import { createSession } from '../api/campaign-access.js';
import { createPin, listPins } from '../server/pin-store.js';
import { initialHuntState } from '../shared/hunt.js';
import { randomUUID } from 'node:crypto';

let server, origin, directory;
const secret = 'test-only-hunt-session-secret-over-32-characters';
const retainedPin = { id: randomUUID(), title: 'Pin já existente', category: 'places', icon: 'landmark', shape: 'marker', color: '#d6bd8e', description: '', x: .4, y: .6, revision: 1 };
const request = (method = 'GET', role = 'admin', body, headers = {}) => fetch(`${origin}/api/map-state`, { method, headers: { ...(role ? { Cookie: `dioos_imortais=${createSession(secret, role)}` } : {}), 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const readState = async () => (await (await request()).json()).state;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dioos-hunt-test-'));
  process.env.PIN_DATA_FILE = join(directory, 'pins.json');
  process.env.SESSION_SECRET = secret;
  delete process.env.DATABASE_URL; delete process.env.VERCEL;
  // Older files with real pins must gain the clock without losing their contents.
  await writeFile(process.env.PIN_DATA_FILE, JSON.stringify({ version: 1, pins: [retainedPin] }));
  server = createServer(stateHandler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  const withinTemp = relative(resolve(tmpdir()), resolve(directory));
  assert.ok(withinTemp.startsWith('dioos-hunt-test-') && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
  await rm(directory, { recursive: true, force: true });
});

test('hunt state is private, starts at day 1 afternoon, and reads do not rewrite existing pins', async () => {
  assert.equal((await request('GET', null)).status, 401);
  assert.equal((await request('PATCH', null, {})).status, 401);
  const before = await readFile(process.env.PIN_DATA_FILE, 'utf8');
  const response = await request('GET', 'player');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).state, initialHuntState);
  assert.equal(await readFile(process.env.PIN_DATA_FILE, 'utf8'), before);
});

test('only an authenticated administrator can publish the clock', async () => {
  assert.equal((await request('PATCH', 'player', { day: 5, period: 'night', revision: 0, role: 'admin' })).status, 403);
  assert.equal((await request('PATCH', 'admin', { day: 5, period: 'night', revision: 0 }, { Origin: 'https://another.example' })).status, 403);
  assert.equal((await request('POST', 'admin', {})).status, 405);
  assert.deepEqual(await readState(), initialHuntState);
});

test('approved days and all periods persist, reach players, and can move backwards', async () => {
  let revision = 0;
  for (const [day, period] of [[9, 'morning'], [2, 'night'], [1, 'afternoon']]) {
    const response = await request('PATCH', 'admin', { day, period, revision, injected: 'ignored' });
    assert.equal(response.status, 200);
    const state = (await response.json()).state;
    assert.equal(state.day, day); assert.equal(state.period, period);
    assert.equal(state.revision, ++revision); assert.ok(state.updatedAt);
    assert.equal(state.injected, undefined);
    assert.deepEqual((await (await request('GET', 'player')).json()).state, state);
    const stored = JSON.parse(await readFile(process.env.PIN_DATA_FILE, 'utf8'));
    assert.deepEqual(stored.huntState, state);
    assert.deepEqual(stored.pins, [retainedPin]);
  }
});

test('invalid values and stale approvals leave the published clock unchanged', async () => {
  const prior = await readState();
  for (const invalid of [{ day: 0 }, { day: -1 }, { day: 1.5 }, { day: '2' }, { day: Number.MAX_SAFE_INTEGER + 1 }, { period: 'dawn' }, { period: null }, { revision: -1 }, { revision: '3' }]) {
    assert.equal((await request('PATCH', 'admin', { ...prior, ...invalid })).status, 400);
  }
  assert.equal((await request('PATCH', 'admin', { ...prior, revision: 0 })).status, 409);
  assert.deepEqual(await readState(), prior);
});

test('concurrent approvals have one winner instead of silently overwriting', async () => {
  const state = await readState();
  const responses = await Promise.all(['morning', 'night'].map(period => request('PATCH', 'admin', { ...state, period, day: 12 })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await readState()).revision, state.revision + 1);
});

test('concurrent pin creation and clock publication preserve both sets of data', async () => {
  const state = await readState();
  const nextPin = { ...retainedPin, title: 'Outro pin' };
  await Promise.all([createPin(randomUUID(), nextPin), request('PATCH', 'admin', { ...state, day: 42, period: 'night' }).then(response => assert.equal(response.status, 200))]);
  assert.equal((await readState()).day, 42);
  assert.equal((await listPins()).length, 2);
});

test('Vercel never pretends to publish a clock without persistent storage', async () => {
  process.env.VERCEL = '1';
  try {
    assert.equal((await request()).status, 503);
    assert.equal((await request('PATCH', 'admin', { day: 1, period: 'morning', revision: 5 })).status, 503);
  } finally { delete process.env.VERCEL; }
});
