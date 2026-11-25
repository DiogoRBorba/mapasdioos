import { createHash, timingSafeEqual } from 'node:crypto';
import { StoreError } from './pin-store.js';

export function equalSecret(left, right) {
  return typeof left === 'string' && typeof right === 'string' && timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}
const attempts = new Map();
export function checkAttempt(req, purpose) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const ip = String((process.env.VERCEL ? req.headers['x-forwarded-for'] : req.socket?.remoteAddress) || 'unknown').split(',')[0];
  const key = `${purpose}:${ip}`;
  const entry = attempts.get(key) || { count: 0, until: now + 60000 };
  if (entry.count >= 6 || attempts.size > 10000) throw new StoreError(429, 'Muitas tentativas. Aguarde um minuto e tente novamente.');
  entry.count++; attempts.set(key, entry);
  return () => attempts.delete(key);
}
export function confirmAdminPassword(req, password) {
  const clear = checkAttempt(req, 'delete-campaign');
  if (!process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD) throw new StoreError(503, 'A senha de administrador não está configurada.');
  if (typeof password !== 'string' || password.length > 512 || !equalSecret(password, process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD)) throw new StoreError(401, 'Senha de administrador incorreta. A campanha não foi excluída.');
  clear();
}
