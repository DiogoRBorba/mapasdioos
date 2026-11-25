import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { defaultCampaignId } from '../shared/campaigns.js';
import { currentCampaign } from './campaign-scope.js';
import { initialHuntState } from '../shared/hunt.js';
import { normalizeEffects, normalizeHeader } from '../shared/effects.js';

export class StoreError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
let queue = Promise.resolve();
let sql;
let schemaReady;
let huntSchemaReady;
let pagesSchemaReady;

async function pagesDatabase() {
  const db = await database();
  if (!pagesSchemaReady) pagesSchemaReady = db`CREATE TABLE IF NOT EXISTS dioos_map_pages (
    id uuid PRIMARY KEY, campaign_id text NOT NULL, data jsonb NOT NULL,
    revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`.catch(error => { pagesSchemaReady = undefined; throw error; });
  await pagesSchemaReady;
  return db;
}
export async function listMapPages() {
  assertStorage();
  if (process.env.DATABASE_URL) { const db = await pagesDatabase(); return (await db`SELECT * FROM dioos_map_pages WHERE campaign_id = ${currentCampaign()} ORDER BY created_at`).map(fromRow); }
  await queue;
  return (await readLocal()).data.mapPages || [];
}
export async function getMapPage(id) {
  if (process.env.DATABASE_URL) { const db = await pagesDatabase(); const rows = await db`SELECT * FROM dioos_map_pages WHERE campaign_id = ${currentCampaign()} AND id = ${id}`; return rows[0] ? fromRow(rows[0]) : null; }
  return (await listMapPages()).find(page => page.id === id) || null;
}
export async function saveMapPage(id, revision, data) {
  assertStorage();
  const conflict = () => new StoreError(409, 'Este mapa foi salvo ou alterado em outra aba. Atualize a lista antes de editar novamente.');
  if (process.env.DATABASE_URL) {
    const db = await pagesDatabase();
    const rows = revision === 0
      ? await db`INSERT INTO dioos_map_pages(id,campaign_id,data) VALUES(${id},${currentCampaign()},${JSON.stringify(data)}::jsonb) ON CONFLICT DO NOTHING RETURNING *`
      : await db`UPDATE dioos_map_pages SET data=${JSON.stringify(data)}::jsonb, revision=revision+1, updated_at=now() WHERE id=${id} AND campaign_id=${currentCampaign()} AND revision=${revision} RETURNING *`;
    if (!rows.length) throw conflict();
    return fromRow(rows[0]);
  }
  return localTransaction(store => {
    const pages = store.mapPages ||= [];
    const old = pages.find(page => page.id === id);
    if ((old?.revision || 0) !== revision || (!old && revision !== 0)) throw conflict();
    const now = new Date().toISOString();
    const page = {...data,id,revision:revision+1,createdAt:old?.createdAt || now,updatedAt:now};
    if (old) pages[pages.indexOf(old)] = page; else pages.push(page);
    return page;
  });
}

export async function database() {
  if (!sql) sql = neon(process.env.DATABASE_URL);
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS dioos_map_pins (
      id uuid PRIMARY KEY, campaign_id text NOT NULL, data jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`.catch(error => { schemaReady = undefined; throw error; });
  }
  await schemaReady;
  return sql;
}
function fromRow(row) { return { ...row.data, id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at }; }
async function readLocal() {
  const base = resolve(process.env.PIN_DATA_FILE || '.data/imortais-pins.json');
  const path = currentCampaign() === defaultCampaignId ? base : resolve(dirname(base), `campaign-${currentCampaign()}.json`);
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.pins)) throw new Error('Invalid pin store');
    return { path, data };
  } catch (error) { if (error.code === 'ENOENT') return { path, data: { version: 1, pins: [] } }; throw error; }
}
function localTransaction(action) {
  const result = queue.then(async () => {
    const { path, data } = await readLocal();
    const result = action(data);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
    await rename(temp, path);
    return result;
  });
  queue = result.catch(() => {});
  return result;
}
export function assertStorage() {
  if (process.env.VERCEL && !process.env.DATABASE_URL) throw new StoreError(503, 'O banco de pins ainda não foi conectado. Configure DATABASE_URL na Vercel.');
}
export async function listPins(mapId) {
  assertStorage();
  if (mapId !== undefined && process.env.DATABASE_URL) { const db = await database(); return (await db`SELECT * FROM dioos_map_pins WHERE campaign_id = ${currentCampaign()} AND deleted = false AND COALESCE(data->>'mapId','main') = ${mapId} ORDER BY created_at`).map(fromRow); }
  if (process.env.DATABASE_URL) { const db = await database(); return (await db`SELECT * FROM dioos_map_pins WHERE campaign_id = ${currentCampaign()} AND deleted = false ORDER BY created_at`).map(fromRow); }
  await queue;
  return (await readLocal()).data.pins.filter(pin => !pin.deleted && (mapId === undefined || (pin.mapId || 'main') === mapId)).map(({ deleted, ...pin }) => pin);
}
export async function createPin(id, data) {
  assertStorage();
  if (process.env.DATABASE_URL) {
    const db = await database();
    const rows = await db`INSERT INTO dioos_map_pins (id, campaign_id, data) VALUES (${id}, ${currentCampaign()}, ${JSON.stringify(data)}::jsonb) ON CONFLICT (id) DO NOTHING RETURNING *`;
    if (!rows.length) throw new StoreError(409, 'Este pin já foi salvo. Atualize a lista antes de tentar novamente.');
    return fromRow(rows[0]);
  }
  return localTransaction(store => {
    if (store.pins.some(pin => pin.id === id)) throw new StoreError(409, 'Este pin já foi salvo. Atualize a lista antes de tentar novamente.');
    const now = new Date().toISOString();
    const pin = { ...data, id, revision: 1, createdAt: now, updatedAt: now };
    store.pins.push(pin); return pin;
  });
}
export async function updatePin(id, revision, data, deleting = false, mapId = 'main') {
  assertStorage();
  if (process.env.DATABASE_URL) {
    const db = await database();
    const rows = deleting
      ? await db`UPDATE dioos_map_pins SET deleted = true, revision = revision + 1, updated_at = now() WHERE id = ${id} AND campaign_id = ${currentCampaign()} AND COALESCE(data->>'mapId','main') = ${mapId} AND revision = ${revision} AND deleted = false RETURNING *`
      : await db`UPDATE dioos_map_pins SET data = ${JSON.stringify(data)}::jsonb, revision = revision + 1, updated_at = now() WHERE id = ${id} AND campaign_id = ${currentCampaign()} AND COALESCE(data->>'mapId','main') = ${mapId} AND revision = ${revision} AND deleted = false RETURNING *`;
    if (!rows.length) throw new StoreError(409, 'O pin foi alterado ou removido em outra aba. Feche o editor e abra-o novamente.');
    return fromRow(rows[0]);
  }
  return localTransaction(store => {
    const index = store.pins.findIndex(pin => pin.id === id && !pin.deleted && (pin.mapId || 'main') === mapId);
    if (index < 0 || store.pins[index].revision !== revision) throw new StoreError(409, 'O pin foi alterado ou removido em outra aba. Feche o editor e abra-o novamente.');
    const old = store.pins[index];
    const pin = { ...old, ...(deleting ? { deleted: true } : data), revision: old.revision + 1, updatedAt: new Date().toISOString() };
    store.pins[index] = pin; return pin;
  });
}

async function huntDatabase() {
  const db = await database();
  if (!huntSchemaReady) {
    huntSchemaReady = (async () => {
      await db`CREATE TABLE IF NOT EXISTS dioos_hunt_state (
        campaign_id text PRIMARY KEY, day bigint NOT NULL DEFAULT 1,
        period text NOT NULL DEFAULT 'afternoon', revision integer NOT NULL DEFAULT 0,
        updated_at timestamptz
      )`;
      await db`ALTER TABLE dioos_hunt_state ADD COLUMN IF NOT EXISTS effects jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS header jsonb NOT NULL DEFAULT '{}'::jsonb`;
    })().catch(error => { huntSchemaReady = undefined; throw error; });
  }
  await huntSchemaReady;
  await db`INSERT INTO dioos_hunt_state (campaign_id) VALUES (${currentCampaign()}) ON CONFLICT DO NOTHING`;
  return db;
}
const huntFromRow = row => ({ day: Number(row.day), period: row.period, revision: row.revision, updatedAt: row.updated_at, effects:normalizeEffects(row.effects), header:normalizeHeader(row.header) });
export async function getHuntState() {
  assertStorage();
  if (process.env.DATABASE_URL) {
    const db = await huntDatabase();
    return huntFromRow((await db`SELECT * FROM dioos_hunt_state WHERE campaign_id = ${currentCampaign()}`)[0]);
  }
  await queue;
  const state=(await readLocal()).data.huntState || initialHuntState;
  return {...state,effects:normalizeEffects(state.effects),header:normalizeHeader(state.header)};
}
export async function publishHuntState({ day, period, revision, effects, header }) {
  assertStorage();
  const conflict = () => new StoreError(409, 'A configuração do mapa mudou em outra aba. Feche o painel, atualize o mapa e abra novamente.');
  if (process.env.DATABASE_URL) {
    const db = await huntDatabase();
    const rows = await db`UPDATE dioos_hunt_state SET day = COALESCE(${day??null}::bigint,day), period = COALESCE(${period??null}::text,period), effects = COALESCE(${effects?JSON.stringify(effects):null}::jsonb,effects), header = COALESCE(${header?JSON.stringify(header):null}::jsonb,header), revision = revision + 1, updated_at = now()
      WHERE campaign_id = ${currentCampaign()} AND revision = ${revision} RETURNING *`;
    if (!rows.length) throw conflict();
    return huntFromRow(rows[0]);
  }
  return localTransaction(store => {
    const current = store.huntState || initialHuntState;
    if (current.revision !== revision) throw conflict();
    const next = { day:day??current.day, period:period??current.period, effects:normalizeEffects(effects??current.effects), header:normalizeHeader(header??current.header), revision: revision + 1, updatedAt: new Date().toISOString() };
    store.huntState = next;
    return next;
  });
}
