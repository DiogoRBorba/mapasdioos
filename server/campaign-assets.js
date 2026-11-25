import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { database, assertStorage, StoreError } from './pin-store.js';
import { validId } from './pin-validation.js';
import { validCampaignId } from '../shared/campaigns.js';
const directory = () => join(dirname(resolve(process.env.PIN_DATA_FILE || '.data/imortais-pins.json')), 'campaign-assets');
let ready;
async function assetDatabase() {
  const db = await database();
  if (!ready) ready = db`CREATE TABLE IF NOT EXISTS dioos_campaign_assets (id uuid PRIMARY KEY, metadata jsonb NOT NULL, data text NOT NULL)`.catch(error => {ready=undefined;throw error;});
  await ready; return db;
}
export async function getAsset(id) {
  assertStorage(); if (!validId(id)) return null;
  if (process.env.DATABASE_URL) { const db = await assetDatabase(); return (await db`SELECT metadata,data FROM dioos_campaign_assets WHERE id=${id}`)[0] || null; }
  try { return JSON.parse(await readFile(join(directory(),`${id}.json`),'utf8')); } catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
export async function createAsset(body) {
  assertStorage();
  if (!body || !validCampaignId(body.campaignId) || !['cover','map'].includes(body.kind) || typeof body.name !== 'string' || body.name.length > 240 || typeof body.data !== 'string' || body.data.length > 4_194_304 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new StoreError(400,'Envie uma imagem JPG, PNG ou WebP válida.');
  let output;
  try {
    const image=sharp(Buffer.from(body.data,'base64'),{limitInputPixels:64_000_000,failOn:'warning'}); const info=await image.metadata();
    if(!['jpeg','png','webp'].includes(info.format)||(info.pages||1)>1)throw new Error('format');
    const size=body.kind==='map'?6000:2400;
    output=await image.rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).webp({quality:body.kind==='map'?94:88}).toBuffer({resolveWithObject:true});
  } catch {throw new StoreError(400,'Não foi possível abrir a imagem. Use JPG, PNG ou WebP sem animação.');}
  if(output.data.length > 4*1024*1024)throw new StoreError(413,'A imagem é muito grande após otimização. Envie uma versão menor.');
  const metadata={id:randomUUID(),campaignId:body.campaignId,kind:body.kind,name:body.name.trim().slice(0,120),width:output.info.width,height:output.info.height};
  const record={metadata,data:output.data.toString('base64')};
  if(process.env.DATABASE_URL){const db=await assetDatabase();await db`INSERT INTO dioos_campaign_assets(id,metadata,data) VALUES(${metadata.id},${JSON.stringify(metadata)}::jsonb,${record.data})`;}
  else {await mkdir(directory(),{recursive:true});await writeFile(join(directory(),`${metadata.id}.json`),JSON.stringify(record),{encoding:'utf8',flag:'wx'});}
  return metadata;
}
