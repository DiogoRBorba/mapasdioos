import { createHmac } from 'node:crypto';
import { equalSecret } from './security.js';
import { isUuid } from './feed-store.js';
const seconds=8*60*60;
export function createFeedSession(id, secret, now=Date.now()) {
  const payload=Buffer.from(JSON.stringify({purpose:'xweeter',id,expires:now+seconds*1000})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function readFeedSession(req,now=Date.now()) {
  const secret=process.env.SESSION_SECRET;
  const token=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('dioos_xweeter='))?.slice(14);
  if(!secret || !token || token.length>2048)return null;
  try {const [payload,signature,...extra]=token.split('.');if(extra.length || !equalSecret(signature,createHmac('sha256',secret).update(payload).digest('base64url')))return null;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.purpose==='xweeter' && isUuid(data.id) && Number.isFinite(data.expires) && data.expires>now ? data.id : null;} catch{return null;}
}
export function feedCookie(req, token='') {
  const secure=process.env.VERCEL || process.env.NODE_ENV==='production' || req.headers['x-forwarded-proto']==='https';
  return `dioos_xweeter=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${token?seconds:0}${secure?'; Secure':''}`;
}
