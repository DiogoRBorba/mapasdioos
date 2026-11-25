import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { defaultCampaignId } from '../shared/campaigns.js';
import { currentCampaign } from './campaign-scope.js';
import { MAX_IMAGE_BYTES } from '../shared/pin-images.js';
import { assertStorage, database, StoreError } from './pin-store.js';
import { validId } from './pin-validation.js';

let ready;
async function imageDatabase() {
  const db = await database();
  if (!ready) ready = db`CREATE TABLE IF NOT EXISTS dioos_pin_images (
    id uuid PRIMARY KEY, campaign_id text NOT NULL, metadata jsonb NOT NULL,
    data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`.catch(error => { ready = undefined; throw error; });
  await ready; return db;
}
const imageDirectory = () => join(dirname(resolve(process.env.PIN_DATA_FILE || '.data/imortais-pins.json')), currentCampaign() === defaultCampaignId ? 'pin-images' : `pin-images-${currentCampaign()}`);
export async function storePinImage(body) {
  assertStorage();
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 240 || typeof body.data !== 'string' || body.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new StoreError(400, 'Envie uma imagem JPG, PNG ou WebP válida.');
  const input = Buffer.from(body.data, 'base64');
  if (input.length > MAX_IMAGE_BYTES) throw new StoreError(413, 'A imagem é muito grande. Escolha um arquivo menor.');
  let output;
  try {
    const pipeline = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const info = await pipeline.metadata();
    if (!['jpeg', 'png', 'webp'].includes(info.format) || (info.pages || 1) > 1) throw new Error('FORMAT');
    output = await pipeline.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  } catch { throw new StoreError(400, 'Não foi possível abrir a imagem. Use JPG, PNG ou WebP sem animação.'); }
  if (output.data.length > MAX_IMAGE_BYTES) throw new StoreError(413, 'A imagem continua muito grande após otimização.');
  const metadata = { id: randomUUID(), name: body.name.trim().slice(0, 120), width: output.info.width, height: output.info.height };
  const data = output.data.toString('base64');
  if (process.env.DATABASE_URL) {
    const db = await imageDatabase();
    await db`INSERT INTO dioos_pin_images (id, campaign_id, metadata, data) VALUES (${metadata.id}, ${currentCampaign()}, ${JSON.stringify(metadata)}::jsonb, ${data})`;
  } else {
    await mkdir(imageDirectory(), { recursive: true });
    await writeFile(join(imageDirectory(), `${metadata.id}.json`), JSON.stringify({ metadata, data }), { encoding: 'utf8', flag: 'wx' });
  }
  return metadata;
}
export async function getPinImage(id, metadataOnly = false) {
  assertStorage();
  if (!validId(id)) return null;
  if (process.env.DATABASE_URL) {
    const db = await imageDatabase();
    const rows = metadataOnly
      ? await db`SELECT metadata FROM dioos_pin_images WHERE id = ${id} AND campaign_id = ${currentCampaign()}`
      : await db`SELECT metadata, data FROM dioos_pin_images WHERE id = ${id} AND campaign_id = ${currentCampaign()}`;
    return rows[0] || null;
  }
  try {
    const record = JSON.parse(await readFile(join(imageDirectory(), `${id}.json`), 'utf8'));
    return metadataOnly ? { metadata: record.metadata } : record;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
