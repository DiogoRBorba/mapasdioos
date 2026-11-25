import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import handler, { createSession, validateSession, readSession } from '../api/campaign-access.js';

const secret = 'test-only-session-secret-with-at-least-32-characters';
const password = 'test-only-campaign-password';
const adminPassword = 'test-only-admin-password';
let server, base;
before(async () => {
  process.env.SESSION_SECRET = secret;
  process.env.CAMPAIGN_IMORTAIS_PLAYER_PASSWORD = password;
  process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD = adminPassword;
  server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
const post = (body, headers = {}) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body && { role: 'player', ...body }) });

test('signed sessions reject tampering, expiration, wrong keys and campaign scopes', () => {
  const token = createSession(secret, 'player', 1000);
  assert.equal(readSession(token, secret, 1001).role, 'player');
  assert.equal(validateSession(token, secret, 1001), true);
  assert.equal(validateSession(token + 'x', secret, 1001), false);
  assert.equal(validateSession(token, 'a-different-secret', 1001), false);
  assert.equal(validateSession(token, secret, 1000 + 8 * 60 * 60 * 1000), false);
  assert.equal(validateSession('malformed', secret), false);
  const payload = Buffer.from(JSON.stringify({ version: 2, campaignId: 'another-campaign', role: 'player', expires: Date.now() + 10000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  assert.equal(validateSession(`${payload}.${signature}`, secret), false);
});

test('both roles require their own password, restore role from cookie and clear session', async () => {
  let response = await fetch(base);
  assert.equal((await response.json()).authenticated, false);
  response = await post({ campaignId: 'a-ultima-valsa-dos-imortais', password: 'incorrect' });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  for (const role of ['player', 'admin']) {
  response = await post({ campaignId: 'a-ultima-valsa-dos-imortais', role, password: role === 'admin' ? adminPassword : password });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).role, role);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api/);
  response = await fetch(base, { headers: { Cookie: cookie.split(';')[0] } });
  assert.deepEqual(await response.json(), { authenticated: true, campaignId: 'a-ultima-valsa-dos-imortais', role });
  response = await fetch(base, { method: 'DELETE' });
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  }
});

test('player cannot gain admin with player password or tampered cookie', async () => {
  const response = await post({ campaignId: 'a-ultima-valsa-dos-imortais', role: 'admin', password });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  const inverse = await post({ campaignId: 'a-ultima-valsa-dos-imortais', role: 'player', password: adminPassword });
  assert.equal(inverse.status, 401);
  const token = createSession(secret, 'player');
  const [payload, signature] = token.split('.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  data.role = 'admin';
  const tampered = `${Buffer.from(JSON.stringify(data)).toString('base64url')}.${signature}`;
  assert.equal(readSession(tampered, secret), null);
  const check = await fetch(base, { headers: { Cookie: `dioos_imortais=${tampered}` } });
  assert.equal((await check.json()).authenticated, false);
  // A valid login resets the instance throttle for following cases.
  assert.equal((await post({ campaignId: 'a-ultima-valsa-dos-imortais', password })).status, 200);
});

test('invalid bodies, unsupported methods and cross-origin writes fail', async () => {
  assert.equal((await post({ campaignId: 'unknown', password })).status, 400);
  assert.equal((await post({ campaignId: 'campanha-02', password })).status, 400);
  assert.equal((await post({ campaignId: 'a-ultima-valsa-dos-imortais', role: 'owner', password })).status, 400);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post({ campaignId: 'a-ultima-valsa-dos-imortais', password }, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await fetch(base, { method: 'PATCH' })).status, 405);
  assert.equal((await fetch(base, { method: 'POST', body: '{' })).status, 400);
  assert.equal((await post({ password: 'a'.repeat(3000) })).status, 400);
});

test('missing configuration fails closed', async () => {
  delete process.env.SESSION_SECRET;
  assert.equal((await fetch(base)).status, 503);
  process.env.SESSION_SECRET = secret;
  delete process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD;
  assert.equal((await post({ campaignId: 'a-ultima-valsa-dos-imortais', role: 'admin', password: adminPassword })).status, 503);
  assert.equal((await post({ campaignId: 'a-ultima-valsa-dos-imortais', password })).status, 200);
  process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD = adminPassword;
});

test('repeated wrong passwords are throttled', async () => {
  for (let i = 0; i < 6; i++) assert.equal((await post({ campaignId: 'a-ultima-valsa-dos-imortais', password: 'wrong' })).status, 401);
  const response = await post({ campaignId: 'a-ultima-valsa-dos-imortais', password: 'wrong' });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
});
