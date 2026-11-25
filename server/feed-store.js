import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { database, assertStorage, StoreError } from './pin-store.js';
import { hashPassword } from './campaign-store.js';

export const postLifetime = 72 * 60 * 60 * 1000;
export const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
let ready, queue = Promise.resolve();
const filename = () => process.env.FEED_DATA_FILE || join(dirname(resolve(process.env.PIN_DATA_FILE || '.data/imortais-pins.json')), 'xweeter.json');
async function dbReady() {
  const db = await database();
  if (!ready) ready = (async () => {
    await db`CREATE TABLE IF NOT EXISTS dioos_xweeters (id uuid PRIMARY KEY, name text NOT NULL, color text NOT NULL, password_hash text NOT NULL, avatar text, last_post_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`;
    await db`ALTER TABLE dioos_xweeters ADD COLUMN IF NOT EXISTS avatar_version text NOT NULL DEFAULT '1'`;
    await db`CREATE TABLE IF NOT EXISTS dioos_xweets (id uuid PRIMARY KEY, character_id uuid NOT NULL REFERENCES dioos_xweeters(id), body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'))`;
    await db`CREATE INDEX IF NOT EXISTS dioos_xweets_expiry ON dioos_xweets(expires_at)`;
    await db`CREATE INDEX IF NOT EXISTS dioos_xweets_timeline ON dioos_xweets(created_at DESC, id DESC)`;
  })().catch(error => { ready=undefined; throw error; });
  await ready; return db;
}
async function readLocal() {
  try { return JSON.parse(await readFile(filename(),'utf8')); }
  catch(error) { if(error.code==='ENOENT')return {characters:[],posts:[]}; throw error; }
}
function transact(action) {
  const result = queue.then(async () => {
    const data = await readLocal(); const result = action(data);
    const path=filename(); await mkdir(dirname(path),{recursive:true}); const temp=`${path}.${randomUUID()}.tmp`;
    await writeFile(temp,JSON.stringify(data)); await rename(temp,path); return result;
  }); queue=result.catch(()=>{}); return result;
}
export function publicCharacter(character) { return {id:character.id,name:character.name,color:character.color,avatar:character.has_avatar || character.avatar ? `/api/feed?action=avatar&id=${character.id}&v=${character.avatar_version || '1'}` : null}; }
export async function listCharacters() {
  assertStorage();
  if(process.env.DATABASE_URL) { const db=await dbReady(); return (await db`SELECT id,name,color,avatar_version,(avatar IS NOT NULL) AS has_avatar FROM dioos_xweeters ORDER BY created_at,id`).map(publicCharacter); }
  await queue; return (await readLocal()).characters.map(publicCharacter);
}
export async function getCharacter(id, includeAvatar=false) {
  if(!isUuid(id))return null;
  assertStorage();
  if(process.env.DATABASE_URL) {
    const db=await dbReady();
    const rows=includeAvatar ? await db`SELECT * FROM dioos_xweeters WHERE id=${id}` : await db`SELECT id,name,color,password_hash,(avatar IS NOT NULL) AS has_avatar FROM dioos_xweeters WHERE id=${id}`;
    return rows[0] || null;
  }
  await queue; return (await readLocal()).characters.find(item=>item.id===id) || null;
}
export async function createCharacter(input, editing=false) {
  assertStorage();
  if(!input || !isUuid(input.id) || typeof input.name!=='string' || !input.name.trim() || Array.from(input.name).length>60 || typeof input.password!=='string' || (!(editing && input.password==='') && input.password.length<4) || input.password.length>512 || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new StoreError(400,'Informe nome, cor e uma senha de pelo menos 4 caracteres.');
  if(input.password===process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD)throw new StoreError(400,'Escolha uma senha diferente da senha de administrador.');
  let avatar=null;
  if(input.image!==undefined && typeof input.image!=='string')throw new StoreError(400,'Imagem inválida.');
  if(input.image) {
    if(typeof input.image!=='string' || input.image.length>4_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.image))throw new StoreError(400,'Imagem inválida ou muito grande.');
    try { const img=sharp(Buffer.from(input.image,'base64'),{limitInputPixels:40_000_000,animated:false}); const meta=await img.metadata(); if(!['jpeg','png','webp'].includes(meta.format))throw new Error(); avatar=(await img.rotate().resize(256,256,{fit:'cover'}).webp({quality:80}).toBuffer()).toString('base64'); }
    catch { throw new StoreError(400,'Use uma foto JPG, PNG ou WebP válida.'); }
  }
  const character={id:input.id,name:input.name.trim(),color:input.color.toLowerCase(),password_hash:input.password?hashPassword(input.password):null,avatar};
  if(editing) {
    const changeImage=input.image!==undefined;
    const version=avatar?createHash('sha256').update(avatar).digest('hex').slice(0,16):'1';
    if(process.env.DATABASE_URL) {
      const db=await dbReady();
      const rows=await db`UPDATE dioos_xweeters SET name=${character.name},color=${character.color},password_hash=COALESCE(${character.password_hash},password_hash),avatar=CASE WHEN ${changeImage} THEN ${avatar} ELSE avatar END,avatar_version=CASE WHEN ${changeImage} THEN ${version} ELSE avatar_version END WHERE id=${character.id} RETURNING id,name,color,avatar_version,(avatar IS NOT NULL) AS has_avatar`;
      if(!rows.length)throw new StoreError(404,'Personagem não encontrado.');
      return publicCharacter(rows[0]);
    }
    return transact(store=>{
      const existing=store.characters.find(item=>item.id===character.id);
      if(!existing)throw new StoreError(404,'Personagem não encontrado.');
      existing.name=character.name;existing.color=character.color;
      if(character.password_hash)existing.password_hash=character.password_hash;
      if(changeImage){existing.avatar=avatar;existing.avatar_version=version;}
      return publicCharacter(existing);
    });
  }
  if(process.env.DATABASE_URL) {
    const db=await dbReady();const rows=await db`INSERT INTO dioos_xweeters(id,name,color,password_hash,avatar) VALUES (${character.id},${character.name},${character.color},${character.password_hash},${avatar}) ON CONFLICT DO NOTHING RETURNING id`;
    if(!rows.length)throw new StoreError(409,'Este personagem já foi salvo. Volte à lista.');
    return publicCharacter(character);
  }
  return transact(store=>{if(store.characters.some(item=>item.id===character.id))throw new StoreError(409,'Este personagem já foi salvo.');store.characters.push(character);return publicCharacter(character);});
}
export async function purgeExpired(now=Date.now()) {
  assertStorage();
  if(process.env.DATABASE_URL) {const db=await dbReady(); const rows=await db`DELETE FROM dioos_xweets WHERE expires_at <= now() RETURNING id`;return rows.length;}
  // Do not rewrite the local store for every read when nothing has expired.
  await queue; if(!(await readLocal()).posts.some(post=>Date.parse(post.expiresAt)<=now))return 0;
  return transact(store=>{const before=store.posts.length;store.posts=store.posts.filter(post=>Date.parse(post.expiresAt)>now);return before-store.posts.length;});
}
const fromRow = row => ({id:row.id,characterId:row.character_id,text:row.body,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString()});
export async function listPosts(cursor) {
  await purgeExpired();
  let before;
  if(cursor) {
    try { const [date,id]=Buffer.from(cursor,'base64url').toString().split('|'); if(!isUuid(id) || !Number.isFinite(Date.parse(date)))throw new Error(); before={date:new Date(date).toISOString(),id}; }
    catch { throw new StoreError(400,'Página inválida. Atualize o mural.'); }
  }
  let posts;
  if(process.env.DATABASE_URL) {
    const db=await dbReady();
    const rows=before ? await db`SELECT * FROM dioos_xweets WHERE expires_at > now() AND (created_at,id) < (${before.date}::timestamptz,${before.id}::uuid) ORDER BY created_at DESC,id DESC LIMIT 31` : await db`SELECT * FROM dioos_xweets WHERE expires_at > now() ORDER BY created_at DESC,id DESC LIMIT 31`;
    posts=rows.map(fromRow);
  } else { await queue; posts=(await readLocal()).posts.filter(post=>!before || post.createdAt<before.date || (post.createdAt===before.date && post.id<before.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(0,31); }
  const hasMore=posts.length>30;posts=posts.slice(0,30);const last=posts.at(-1);
  return {posts,nextCursor:hasMore?Buffer.from(`${last.createdAt}|${last.id}`).toString('base64url'):null};
}
export async function createPost(characterId, input, now=Date.now()) {
  if(!input || !isUuid(input.id) || typeof input.text!=='string' || !input.text.trim() || Array.from(input.text.trim()).length>500 || Object.keys(input).some(key=>!['id','text'].includes(key)))throw new StoreError(400,'Escreva somente texto ou emojis, com até 500 caracteres.');
  await purgeExpired(now);const text=input.text.trim();
  if(process.env.DATABASE_URL) {
    const db=await dbReady();
    // One statement serializes writers on the character row and prevents concurrent spam.
    const rows=await db`WITH allowed AS (UPDATE dioos_xweeters SET last_post_at=now() WHERE id=${characterId} AND (last_post_at IS NULL OR last_post_at <= now()-interval '10 seconds') RETURNING id) INSERT INTO dioos_xweets(id,character_id,body,created_at,expires_at) SELECT ${input.id},id,${text},date_trunc('milliseconds',now()),date_trunc('milliseconds',now())+interval '72 hours' FROM allowed ON CONFLICT DO NOTHING RETURNING *`;
    if(rows.length)return fromRow(rows[0]);
    const duplicate=await db`SELECT * FROM dioos_xweets WHERE id=${input.id} AND character_id=${characterId} AND body=${text} AND expires_at>now()`;
    if(duplicate.length)return fromRow(duplicate[0]);
    throw new StoreError(429,'Espere alguns segundos antes de publicar novamente.');
  }
  return transact(store=>{
    const character=store.characters.find(item=>item.id===characterId);if(!character)throw new StoreError(401,'Entre novamente como personagem.');
    const duplicate=store.posts.find(item=>item.id===input.id);
    if(duplicate) { if(duplicate.characterId===characterId && duplicate.text===text)return duplicate;throw new StoreError(409,'Esta postagem já existe.'); }
    if(character.lastPostAt && now-character.lastPostAt<10000)throw new StoreError(429,'Espere alguns segundos antes de publicar novamente.');
    character.lastPostAt=now;const post={id:input.id,characterId,text,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+postLifetime).toISOString()};store.posts.push(post);return post;
  });
}
