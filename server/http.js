import { requestedCampaign } from './campaign-scope.js';
import { readSession, cookieNameFor } from '../api/campaign-access.js';

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
export function sessionFor(req, campaignId = requestedCampaign(req)) {
  const name = cookieNameFor(campaignId);
  const token = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
  return readSession(token, process.env.SESSION_SECRET, Date.now(), campaignId);
}
export const platformAdmin = req => sessionFor(req, 'platform')?.role === 'admin';
export function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
export async function readJson(req, limit = 20000) {
  let raw;
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > limit) throw new Error('BODY'); }
  }
  if (!raw || Buffer.byteLength(raw) > limit) throw new Error('BODY');
  return JSON.parse(raw);
}
