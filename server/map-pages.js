import { currentCampaign } from './campaign-scope.js';
import { getMapPage, listMapPages, saveMapPage, StoreError } from './pin-store.js';
import { validId } from './pin-validation.js';
import { createAsset, getAsset } from './campaign-assets.js';
import { json, readJson } from './http.js';

export function requestedMap(req) {
  const id = new URL(req.url || '/', 'http://local').searchParams.get('map') || 'main';
  if (id !== 'main' && !validId(id)) throw new StoreError(400, 'Mapa inválido.');
  return id;
}
export async function requireMap(id) {
  if (id === 'main') return null;
  if (!validId(id)) throw new StoreError(400, 'Mapa inválido.');
  const page = await getMapPage(id);
  if (!page) throw new StoreError(404, 'Mapa não encontrado nesta campanha.');
  return page;
}
// These actions share the authenticated campaign endpoint; no platform login is necessary.
export async function handleMapPages(req, res, action) {
  if (action === 'pages' && req.method === 'GET') return json(res, 200, {pages:await listMapPages()});
  if (action === 'map-upload' && req.method === 'POST') {
    let body;
    try { body = await readJson(req, 4_200_000); } catch { throw new StoreError(400, 'Arquivo inválido ou muito grande.'); }
    const asset = await createAsset({...body,campaignId:currentCampaign(),kind:'map'});
    return json(res, 201, {asset});
  }
  if (action !== 'pages' || !['POST','PATCH'].includes(req.method)) return json(res,405,{error:'Método não permitido.'});
  let body;
  try { body = await readJson(req); } catch { throw new StoreError(400, 'Dados inválidos.'); }
  if (!body || !validId(body.id) || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120 || typeof body.description !== 'string' || body.description.length > 4000 || !Number.isSafeInteger(body.revision) || body.revision < 0 || (req.method === 'POST' ? body.revision !== 0 : body.revision < 1)) throw new StoreError(400,'Informe título, descrição e versão válidos para o mapa.');
  const asset = await getAsset(body.assetId);
  if (!asset || asset.metadata.campaignId !== currentCampaign() || asset.metadata.kind !== 'map') throw new StoreError(400,'Envie uma imagem de mapa para esta campanha.');
  const page = await saveMapPage(body.id,body.revision,{title:body.title.trim(),description:body.description.trim(),image:asset.metadata});
  return json(res,req.method==='POST'?201:200,{page});
}
