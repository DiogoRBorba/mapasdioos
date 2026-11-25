import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { database, assertStorage, StoreError } from './pin-store.js';
import { seedCampaigns, defaultCampaignId, validCampaignId, campaignTypes, campaignAvailable } from '../shared/campaigns.js';
let ready, queue = Promise.resolve();
const filename = () => process.env.CAMPAIGNS_DATA_FILE || join(dirname(resolve(process.env.PIN_DATA_FILE || '.data/imortais-pins.json')), 'campaigns.json');
const orderFilename = () => `${filename()}.order.json`;
async function dbReady() {
  const db = await database();
  if (!ready) ready = (async () => {
    await db`CREATE TABLE IF NOT EXISTS dioos_campaigns (id text PRIMARY KEY, data jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`;
    await db`CREATE TABLE IF NOT EXISTS dioos_campaign_order (id integer PRIMARY KEY CHECK (id=1), ids jsonb NOT NULL DEFAULT '[]'::jsonb, revision integer NOT NULL DEFAULT 0)`;
    await db`INSERT INTO dioos_campaign_order(id) VALUES (1) ON CONFLICT DO NOTHING`;
    for (const campaign of seedCampaigns) await db`INSERT INTO dioos_campaigns (id,data) VALUES (${campaign.id},${JSON.stringify(campaign)}::jsonb) ON CONFLICT DO NOTHING`;
  })().catch(error => { ready = undefined; throw error; });
  await ready; return db;
}
async function readLocal() {
  try { return JSON.parse(await readFile(filename(), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(seedCampaigns); throw error; }
}
async function allCampaigns() {
  assertStorage();
  if (process.env.DATABASE_URL) { const db = await dbReady(); return (await db`SELECT data,revision FROM dioos_campaigns ORDER BY created_at,id`).map(row => ({ ...row.data, revision: row.revision })).sort((a,b) => Number(a.number) - Number(b.number)); }
  await queue; return readLocal();
}
async function readOrder() {
  if(process.env.DATABASE_URL){const db=await dbReady();return (await db`SELECT ids,revision FROM dioos_campaign_order WHERE id=1`)[0];}
  try{return JSON.parse(await readFile(orderFilename(),'utf8'));}catch(error){if(error.code==='ENOENT')return {ids:[],revision:0};throw error;}
}
function orderedCampaigns(records,ids){
  const positions=new Map(ids.map((id,index)=>[id,index]));
  return records.filter(item=>!item.deleted).sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity)||Number(a.number)-Number(b.number)||a.id.localeCompare(b.id)).map((item,index)=>({...item,number:String(index+1).padStart(2,'0')}));
}
export async function campaignCatalog(){
  await queue;const records=await allCampaigns(),order=await readOrder();return {campaigns:orderedCampaigns(records,order.ids),orderRevision:order.revision};
}
export async function listCampaigns() { return (await campaignCatalog()).campaigns; }
export async function reorderCampaigns(ids,revision){
  assertStorage();
  if(!Array.isArray(ids)||ids.some(id=>!validCampaignId(id))||new Set(ids).size!==ids.length||!Number.isSafeInteger(revision)||revision<0)throw new StoreError(400,'Ordem de campanhas inválida.');
  const validate=records=>{const active=records.filter(item=>!item.deleted);if(ids.length!==active.length||active.some(item=>!ids.includes(item.id)))throw new StoreError(409,'A coleção mudou. Atualize a lista antes de reordenar.');};
  const conflict=()=>new StoreError(409,'A ordem mudou em outra aba. Atualize a lista antes de reordenar.');
  if(process.env.DATABASE_URL){const db=await dbReady();validate(await allCampaigns());const rows=await db`UPDATE dioos_campaign_order SET ids=${JSON.stringify(ids)}::jsonb,revision=revision+1 WHERE id=1 AND revision=${revision} RETURNING revision`;if(!rows.length)throw conflict();return;}
  const result=queue.then(async()=>{const records=await readLocal(),order=await readOrder();validate(records);if(order.revision!==revision)throw conflict();const path=orderFilename();await mkdir(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify({ids,revision:revision+1}));await rename(temp,path);});queue=result.catch(()=>{});return result;
}
export const getCampaign = async id => (await listCampaigns()).find(campaign => campaign.id === id);
export function publicCampaign({ passwordHash, ...campaign }) {
  const { map, cover, ...fields } = campaign;
  return { ...fields, type:campaign.type || 'map', image: cover ? `/api/campaign-assets?id=${cover.id}` : campaign.image || '', map: map ? { width: map.width, height: map.height, builtin: !!map.builtin } : null, hasPlayerPassword: !!passwordHash || campaign.id === defaultCampaignId, placeholder: !campaignAvailable(campaign) };
}
export function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function checkPassword(password, hash) {
  try { const [salt, encoded] = hash.split(':'); const expected = Buffer.from(encoded, 'hex'); return expected.length === 64 && timingSafeEqual(scryptSync(password, salt, 64), expected); } catch { return false; }
}
export async function saveCampaign(input, assets) {
  assertStorage();
  if (!input || !validCampaignId(input.id) || input.id === 'platform' || !Number.isInteger(input.revision) || input.revision < 0) throw new StoreError(400, 'Dados da campanha inválidos.');
  for (const [key, max] of [['title',120], ['subtitle',120], ['description',2000]]) if (typeof input[key] !== 'string' || input[key].length > max) throw new StoreError(400, 'Revise o título, subtítulo e sinopse.');
  if (!input.title.trim()) throw new StoreError(400, 'Informe o título principal.');
  if(input.type !== undefined && !campaignTypes.includes(input.type))throw new StoreError(400,'Tipo de campanha inválido.');
  if (input.playerPassword !== undefined && (typeof input.playerPassword !== 'string' || input.playerPassword.length > 512 || (input.playerPassword && input.playerPassword.length < 4))) throw new StoreError(400, 'A senha de jogador deve ter de 4 a 512 caracteres.');
  if (input.playerPassword && input.playerPassword === process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD) throw new StoreError(400, 'Use uma senha de jogador diferente da senha de administrador.');
  const apply = records => {
    const old = records.find(item => item.id === input.id);
    if (old?.deleted) throw new StoreError(409, 'Esta campanha foi excluída. Crie uma nova campanha.');
    if ((!old && input.revision !== 0) || (old && old.revision !== input.revision)) throw new StoreError(409, 'Esta campanha mudou em outra aba. Reabra o editor antes de salvar.');
    const map = assets.map || old?.map || null;
    const type = input.type || old?.type || 'map';
    const passwordHash = input.playerPassword ? hashPassword(input.playerPassword) : old?.passwordHash;
    if ((map || type==='social') && input.id !== defaultCampaignId && !passwordHash) throw new StoreError(400, 'Defina a senha de jogador para disponibilizar a campanha.');
    return { ...old, type, id: input.id, title: input.title.trim(), subtitle: input.subtitle.trim(), description: input.description.trim(), image: old?.image || '', cover: assets.cover || old?.cover || null, map, ...(passwordHash ? { passwordHash } : {}), number: old?.number || String(Math.max(0,...records.map(item => Number(item.number))) + 1).padStart(2,'0'), revision: (old?.revision || 0) + 1 };
  };
  if (process.env.DATABASE_URL) {
    const db = await dbReady(); const records = await allCampaigns(); const next = apply(records);
    const rows = records.some(item => item.id === input.id)
      ? await db`UPDATE dioos_campaigns SET data=${JSON.stringify(next)}::jsonb,revision=revision+1 WHERE id=${input.id} AND revision=${input.revision} RETURNING id`
      : await db`INSERT INTO dioos_campaigns(id,data,revision) VALUES(${input.id},${JSON.stringify(next)}::jsonb,1) ON CONFLICT DO NOTHING RETURNING id`;
    if (!rows.length) throw new StoreError(409,'A campanha foi alterada em outra aba. Reabra o editor.');
    return next;
  }
  const result = queue.then(async () => {
    const records = await readLocal(); const next = apply(records); const index = records.findIndex(item => item.id === next.id);
    if (index < 0) records.push(next); else records[index] = next;
    const path = filename(); await mkdir(dirname(path), {recursive:true}); const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(records,null,2),'utf8'); await rename(temp,path); return next;
  }); queue = result.catch(() => {}); return result;
}
export async function deleteCampaign(id, revision) {
  assertStorage();
  if (!validCampaignId(id) || !Number.isInteger(revision) || revision < 0) throw new StoreError(400, 'Campanha inválida.');
  const apply = records => {
    const old = records.find(item => item.id === id);
    if (!old || old.deleted) throw new StoreError(404, 'Esta campanha já não está disponível.');
    if (old.revision !== revision) throw new StoreError(409, 'Esta campanha mudou. Reabra o editor antes de excluir.');
    // Keep a small tombstone so a seeded campaign cannot return on a cold start.
    return { id, number: old.number, revision: revision + 1, deleted: true };
  };
  if (process.env.DATABASE_URL) {
    const db = await dbReady(); const next = apply(await allCampaigns());
    const rows = await db`UPDATE dioos_campaigns SET data=${JSON.stringify(next)}::jsonb,revision=revision+1 WHERE id=${id} AND revision=${revision} RETURNING id`;
    if (!rows.length) throw new StoreError(409, 'A campanha mudou. Reabra o editor.');
    return;
  }
  const result = queue.then(async () => {
    const records = await readLocal(); const next = apply(records);
    records[records.findIndex(item => item.id === id)] = next;
    const path = filename(); await mkdir(dirname(path), { recursive:true }); const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(records,null,2)); await rename(temp,path);
  }); queue = result.catch(() => {}); return result;
}
