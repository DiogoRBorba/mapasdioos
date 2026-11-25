import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { dirname,resolve,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { database,assertStorage,StoreError } from './pin-store.js';
import { isUuid,listCharacters } from './feed-store.js';
import { getCampaign } from './campaign-store.js';
let ready,queue=Promise.resolve();
const filename=()=>process.env.NEWS_DATA_FILE||join(dirname(resolve(process.env.PIN_DATA_FILE||'.data/imortais-pins.json')),'news.json');
async function dbReady(){
  const db=await database();
  if(!ready)ready=(async()=>{
    await listCharacters();
    await db`CREATE TABLE IF NOT EXISTS dioos_news (id uuid PRIMARY KEY,data jsonb NOT NULL,cover text,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
    await db`CREATE TABLE IF NOT EXISTS dioos_news_comments (id uuid PRIMARY KEY,news_id uuid NOT NULL REFERENCES dioos_news(id) ON DELETE CASCADE,character_id uuid NOT NULL REFERENCES dioos_xweeters(id),body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),created_at timestamptz NOT NULL DEFAULT now())`;
    await db`CREATE INDEX IF NOT EXISTS dioos_news_order ON dioos_news(created_at DESC,id DESC)`;
    await db`CREATE INDEX IF NOT EXISTS dioos_news_comments_order ON dioos_news_comments(news_id,created_at DESC,id DESC)`;
  })().catch(error=>{ready=undefined;throw error;});
  await ready;return db;
}
async function readLocal(){try{return JSON.parse(await readFile(filename(),'utf8'));}catch(error){if(error.code==='ENOENT')return {news:[],comments:[],lastComments:{}};throw error;}}
function transaction(action){const result=queue.then(async()=>{const store=await readLocal(),result=action(store),path=filename();await mkdir(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(store));await rename(temp,path);return result;});queue=result.catch(()=>{});return result;}
const fromRow=row=>({...row.data,id:row.id,revision:row.revision,hasCover:row.has_cover,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()});
export function publicNews(record,full=false){const {cover,content,hasCover,...fields}=record;return {...fields,...(full?{content}:{}),image:cover||hasCover?`/api/news?action=cover&id=${record.id}&v=${record.revision}`:null};}
function decodeCursor(value){if(!value)return null;try{if(value.length>200)throw new Error();const [date,id]=Buffer.from(value,'base64url').toString().split('|');if(!isUuid(id)||!Number.isFinite(Date.parse(date)))throw new Error();return {date:new Date(date).toISOString(),id};}catch{throw new StoreError(400,'Página inválida. Atualize a lista.');}}
function page(rows,limit){const more=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1);return {items,nextCursor:more?Buffer.from(`${last.createdAt}|${last.id}`).toString('base64url'):null};}
export async function listNews(cursor,limit=12){
  assertStorage();const before=decodeCursor(cursor);limit=Math.max(1,Math.min(12,Number(limit)||12));let records;
  if(process.env.DATABASE_URL){const db=await dbReady();const rows=before?await db`SELECT id,data-'content' AS data,revision,(cover IS NOT NULL) AS has_cover,created_at,updated_at FROM dioos_news WHERE (created_at,id)<(${before.date}::timestamptz,${before.id}::uuid) ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`:await db`SELECT id,data-'content' AS data,revision,(cover IS NOT NULL) AS has_cover,created_at,updated_at FROM dioos_news ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;records=rows.map(fromRow);}
  else{await queue;records=(await readLocal()).news.filter(item=>!before||item.createdAt<before.date||(item.createdAt===before.date&&item.id<before.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(0,limit+1);}
  const result=page(records,limit);return {news:result.items.map(item=>publicNews(item)),nextCursor:result.nextCursor};
}
export async function getNews(id,includeCover=false){
  if(!isUuid(id))return null;assertStorage();
  if(process.env.DATABASE_URL){const db=await dbReady();const rows=includeCover?await db`SELECT *,cover IS NOT NULL AS has_cover FROM dioos_news WHERE id=${id}`:await db`SELECT id,data,revision,(cover IS NOT NULL) AS has_cover,created_at,updated_at FROM dioos_news WHERE id=${id}`;return rows[0]?{...fromRow(rows[0]),...(includeCover?{cover:rows[0].cover}:{})}:null;}
  await queue;return (await readLocal()).news.find(item=>item.id===id)||null;
}
export async function saveNews(input,creating){
  assertStorage();
  if(!input||!isUuid(input.id)||!Number.isInteger(input.revision)||(creating?input.revision!==0:input.revision<1))throw new StoreError(400,'Notícia inválida.');
  for(const [field,min,max] of [['title',1,160],['summary',0,320],['content',1,30000]])if(typeof input[field]!=='string'||input[field].trim().length<min||input[field].length>max)throw new StoreError(400,'Revise o título, resumo e texto da notícia.');
  let campaignName='';if(input.campaignId){const campaign=await getCampaign(input.campaignId);if(!campaign)throw new StoreError(400,'Escolha uma campanha disponível.');campaignName=[campaign.title,campaign.subtitle].filter(Boolean).join(' ');}
  const data={title:input.title.trim(),summary:input.summary.trim(),content:input.content.trim(),campaignId:input.campaignId||null,campaignName};
  let cover;
  if(input.removeCover===true)cover=null;
  if(input.image){
    if(typeof input.image!=='string'||input.image.length>4_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.image))throw new StoreError(400,'A imagem de capa é inválida ou muito grande.');
    try{const image=sharp(Buffer.from(input.image,'base64'),{limitInputPixels:40_000_000,animated:false});const meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format))throw new Error();const bytes=await image.rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();if(bytes.length>1_500_000)throw new Error();cover=bytes.toString('base64');}catch{throw new StoreError(400,'Use uma capa JPG, PNG ou WebP válida, com até 20 MB.');}
  }
  if(process.env.DATABASE_URL){const db=await dbReady();const rows=creating?await db`INSERT INTO dioos_news(id,data,cover,created_at,updated_at) VALUES (${input.id},${JSON.stringify(data)}::jsonb,${cover||null},date_trunc('milliseconds',now()),date_trunc('milliseconds',now())) ON CONFLICT DO NOTHING RETURNING id,data,revision,cover IS NOT NULL AS has_cover,created_at,updated_at`:await db`UPDATE dioos_news SET data=${JSON.stringify(data)}::jsonb,cover=CASE WHEN ${cover!==undefined} THEN ${cover??null} ELSE cover END,revision=revision+1,updated_at=date_trunc('milliseconds',now()) WHERE id=${input.id} AND revision=${input.revision} RETURNING id,data,revision,cover IS NOT NULL AS has_cover,created_at,updated_at`;
    if(!rows.length)throw new StoreError(409,'Esta notícia mudou ou foi excluída. Reabra o editor.');return publicNews(fromRow(rows[0]),true);}
  return transaction(store=>{const index=store.news.findIndex(item=>item.id===input.id),old=store.news[index];if(creating?!!old:!old||old.revision!==input.revision)throw new StoreError(409,'Esta notícia mudou ou foi excluída. Reabra o editor.');const now=new Date().toISOString(),record={...data,id:input.id,revision:(old?.revision||0)+1,cover:cover===undefined?old?.cover||null:cover,createdAt:old?.createdAt||now,updatedAt:now};if(old)store.news[index]=record;else store.news.push(record);return publicNews(record,true);});
}
export async function deleteNews(id,revision){
  if(!isUuid(id)||!Number.isInteger(revision))throw new StoreError(400,'Notícia inválida.');assertStorage();
  if(process.env.DATABASE_URL){const db=await dbReady();const rows=await db`DELETE FROM dioos_news WHERE id=${id} AND revision=${revision} RETURNING id`;if(!rows.length)throw new StoreError(409,'A notícia mudou ou já foi excluída. Atualize a lista.');return;}
  return transaction(store=>{if(!store.news.some(item=>item.id===id&&item.revision===revision))throw new StoreError(409,'A notícia mudou ou já foi excluída. Atualize a lista.');store.news=store.news.filter(item=>item.id!==id);store.comments=store.comments.filter(item=>item.newsId!==id);});
}
const commentRow=row=>({id:row.id,newsId:row.news_id,characterId:row.character_id,text:row.body,createdAt:new Date(row.created_at).toISOString()});
export async function listComments(id,cursor){
  if(!await getNews(id))throw new StoreError(404,'Notícia não encontrada.');const before=decodeCursor(cursor);let records;
  if(process.env.DATABASE_URL){const db=await dbReady();const rows=before?await db`SELECT * FROM dioos_news_comments WHERE news_id=${id} AND (created_at,id)<(${before.date}::timestamptz,${before.id}::uuid) ORDER BY created_at DESC,id DESC LIMIT 31`:await db`SELECT * FROM dioos_news_comments WHERE news_id=${id} ORDER BY created_at DESC,id DESC LIMIT 31`;records=rows.map(commentRow);}
  else{await queue;records=(await readLocal()).comments.filter(item=>item.newsId===id&&(!before||item.createdAt<before.date||(item.createdAt===before.date&&item.id<before.id))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(0,31);}
  const result=page(records,30);return {comments:result.items,nextCursor:result.nextCursor};
}
export async function addComment(characterId,input){
  if(!input||!isUuid(input.id)||!isUuid(input.newsId)||typeof input.text!=='string'||!input.text.trim()||Array.from(input.text.trim()).length>1000||Object.keys(input).some(key=>!['id','newsId','text'].includes(key)))throw new StoreError(400,'Escreva somente texto e emojis, com até 1.000 caracteres.');
  if(!await getNews(input.newsId))throw new StoreError(404,'Notícia não encontrada.');const text=input.text.trim();
  if(process.env.DATABASE_URL){const db=await dbReady();
    try{const rows=await db`WITH allowed AS (UPDATE dioos_xweeters SET last_post_at=now() WHERE id=${characterId} AND (last_post_at IS NULL OR last_post_at<=now()-interval '10 seconds') RETURNING id) INSERT INTO dioos_news_comments(id,news_id,character_id,body,created_at) SELECT ${input.id},${input.newsId},id,${text},date_trunc('milliseconds',now()) FROM allowed ON CONFLICT DO NOTHING RETURNING *`;
      if(rows.length)return commentRow(rows[0]);const duplicate=await db`SELECT * FROM dioos_news_comments WHERE id=${input.id} AND character_id=${characterId} AND news_id=${input.newsId} AND body=${text}`;if(duplicate.length)return commentRow(duplicate[0]);throw new StoreError(429,'Aguarde alguns segundos antes de comentar novamente.');
    }catch(error){if(error.code==='23503')throw new StoreError(404,'A notícia ou o personagem não está mais disponível.');throw error;}}
  return transaction(store=>{if(!store.news.some(item=>item.id===input.newsId))throw new StoreError(404,'Notícia não encontrada.');const old=store.comments.find(item=>item.id===input.id);if(old){if(old.characterId===characterId&&old.newsId===input.newsId&&old.text===text)return old;throw new StoreError(409,'Este comentário já existe.');}const now=Date.now();if(now-(store.lastComments[characterId]||0)<10000)throw new StoreError(429,'Aguarde alguns segundos antes de comentar novamente.');const comment={id:input.id,newsId:input.newsId,characterId,text,createdAt:new Date(now).toISOString()};store.comments.push(comment);store.lastComments[characterId]=now;return comment;});
}
export async function deleteComment(id){if(!isUuid(id))throw new StoreError(400,'Comentário inválido.');assertStorage();if(process.env.DATABASE_URL){const db=await dbReady();await db`DELETE FROM dioos_news_comments WHERE id=${id}`;}else await transaction(store=>{store.comments=store.comments.filter(item=>item.id!==id);});}
