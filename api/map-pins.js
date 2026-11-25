import { withCampaign } from '../server/campaign-scope.js';
import { json, readJson, sameOrigin, sessionFor } from '../server/http.js';
import { createPin, listPins, StoreError, updatePin } from '../server/pin-store.js';
import { validId, validatePin } from '../server/pin-validation.js';
import { getPinImage } from '../server/pin-images.js';
import { handleMapPages, requestedMap, requireMap } from '../server/map-pages.js';

async function handler(req, res) {
  const session = sessionFor(req);
  if (!session) return json(res, 401, { error: 'Seu acesso expirou. Entre na campanha novamente.' });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE'); return json(res, 405, { error: 'Método não permitido.' });
  }
  if (req.method !== 'GET' && session.role !== 'admin') return json(res, 403, { error: 'Somente o administrador pode editar os pins.' });
  if (req.method !== 'GET' && !sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
  try {
    const action = new URL(req.url || '/', 'http://local').searchParams.get('action');
    if (action) return await handleMapPages(req,res,action);
    const mapId = requestedMap(req);
    await requireMap(mapId);
    if (req.method === 'GET') return json(res, 200, { pins: await listPins(mapId) });
    let body, data;
    try {
      body = await readJson(req);
      if (!body || !validId(body.id)) throw new Error('Identificador inválido.');
      if (req.method !== 'POST' && (!Number.isInteger(body.revision) || body.revision < 1)) throw new Error('Versão do pin inválida.');
      if (req.method !== 'DELETE') data = validatePin(body);
    } catch (error) { return json(res, 400, { error: error.message === 'BODY' || error instanceof SyntaxError ? 'Dados inválidos ou muito extensos.' : error.message }); }
    if (data) {
      if (data.targetMapId) {
        if (data.targetMapId === mapId) return json(res,400,{error:'Escolha outro mapa como destino.'});
        await requireMap(data.targetMapId);
      }
      if (mapId !== 'main') data.mapId = mapId;
      const images = await Promise.all(data.images.map(image => getPinImage(image.id, true)));
      if (images.some(image => !image)) return json(res, 400, { error: 'Uma imagem não está mais disponível. Remova-a do pin e envie novamente.' });
      data.images = images.map(image => image.metadata);
    }
    if (req.method === 'POST') return json(res, 201, { pin: await createPin(body.id, data) });
    const pin = await updatePin(body.id, body.revision, data, req.method === 'DELETE', mapId);
    return json(res, 200, req.method === 'DELETE' ? { deleted: true } : { pin });
  } catch (error) {
    return json(res, error instanceof StoreError ? error.status : 503, { error: error instanceof StoreError ? error.message : 'Não foi possível acessar os pins. Nenhuma alteração foi confirmada; tente novamente.' });
  }
}

export default withCampaign(handler);
