import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { defaultCampaignId, validCampaignId, campaignAvailable } from '../shared/campaigns.js';
import { getCampaign, checkPassword } from '../server/campaign-store.js';
export const cookieNameFor = id => id === 'platform' ? 'dioos_platform' : id === defaultCampaignId ? 'dioos_imortais' : `dioos_${id}`;
const sessionSeconds = 60 * 60 * 8;
const attempts = new Map();
const roles = ['player', 'admin'];

function equal(a, b) {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export function createSession(secret, role, now = Date.now(), campaignId = defaultCampaignId) {
  if (!roles.includes(role)) throw new Error('Invalid session role');
  const payload = Buffer.from(JSON.stringify({ version: 3, campaignId, role, expires: now + sessionSeconds * 1000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readSession(token, secret, now = Date.now(), campaignId = defaultCampaignId) {
  if (!token || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    if (!equal(signature, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!(data.version === 3 || (data.version === 2 && campaignId === defaultCampaignId)) || data.campaignId !== campaignId || !roles.includes(data.role) || !Number.isFinite(data.expires) || data.expires <= now) return null;
    return { campaignId: data.campaignId, role: data.role };
  } catch { return null; }
}

export function validateSession(token, secret, now = Date.now()) {
  return readSession(token, secret, now) !== null;
}

function cookie(req, token, maxAge, campaignId = defaultCampaignId) {
  const cookieName = cookieNameFor(campaignId);
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 2048) throw new Error('body');
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 2048) throw new Error('body');
  }
  return JSON.parse(data || '{}');
}

export default async function handler(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(405, { error: 'Método não permitido.' });
  }
  if (req.method !== 'GET' && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: 'Origem não permitida.' });
    } catch { return send(403, { error: 'Origem não permitida.' }); }
  }
  const requestedId = new URL(req.url || '/', 'http://local').searchParams.get('campaign') || defaultCampaignId;
  if (!validCampaignId(requestedId)) return send(400, {error:'Campanha inválida.'});
  const cookieName = cookieNameFor(requestedId);
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookie(req, '', 0, requestedId));
    return send(200, { authenticated: false });
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return send(503, { code: 'NOT_CONFIGURED', error: 'A entrada desta campanha ainda está sendo preparada. Peça ao Mestre para configurar o acesso.' });
  }
  if (req.method === 'GET') {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const session = readSession(token, secret, Date.now(), requestedId);
    if (session && requestedId !== 'platform') {
      try { if (!await getCampaign(requestedId)) return send(200, { authenticated:false }); }
      catch { return send(503, {error:'O catálogo está indisponível.'}); }
    }
    return send(200, session ? { authenticated: true, ...session } : { authenticated: false });
  }
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  // Best-effort per-instance throttling. Add a shared limiter/WAF before public rollout.
  const remote = process.env.VERCEL ? req.headers['x-forwarded-for'] : req.socket?.remoteAddress;
  const address = String(remote || 'unknown').split(',')[0].trim();
  const previous = attempts.get(address);
  if (previous && previous.count >= 6) {
    res.setHeader('Retry-After', String(Math.ceil((previous.expires - now) / 1000)));
    return send(429, { error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
  }
  let body;
  try { body = await readBody(req); } catch { return send(400, { error: 'Solicitação inválida.' }); }
  if (!body || !validCampaignId(body.campaignId) || !roles.includes(body.role) || typeof body.password !== 'string' || body.password.length > 512) {
    return send(400, { error: 'Informe uma campanha e uma senha válidas.' });
  }
  const campaignId = body.campaignId;
  if (campaignId === 'platform' && body.role !== 'admin') return send(400, {error:'Acesso inválido.'});
  let campaign;
  try { campaign = campaignId === 'platform' ? null : await getCampaign(campaignId); } catch { return send(503, {error:'O catálogo está indisponível.'}); }
  if (campaignId !== 'platform' && !campaignAvailable(campaign)) return send(400, {error:'Esta campanha ainda está em preparação.'});
  const password = body.role === 'admin' ? process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD : campaign?.passwordHash || (campaignId === defaultCampaignId ? process.env.CAMPAIGN_IMORTAIS_PLAYER_PASSWORD : null);
  if (!password) return send(503, { code: 'NOT_CONFIGURED', error: 'Este tipo de acesso ainda não foi configurado. Fale com o Mestre.' });
  if (!(body.role === 'player' && campaign?.passwordHash ? checkPassword(body.password, password) : equal(body.password, password))) {
    if (attempts.size >= 10000) return send(429, { error: 'Tente novamente em um minuto.' });
    attempts.set(address, { count: (previous?.count || 0) + 1, expires: previous?.expires || now + 60000 });
    return send(401, { error: 'Essa senha não abriu a passagem. Confira com o Mestre e tente novamente.' });
  }
  attempts.delete(address);
  res.setHeader('Set-Cookie', cookie(req, createSession(secret, body.role, Date.now(), campaignId), sessionSeconds, campaignId));
  return send(200, { authenticated: true, campaignId, role: body.role });
}
