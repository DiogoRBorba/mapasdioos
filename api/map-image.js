import { getCampaign } from '../server/campaign-store.js';
import { getAsset } from '../server/campaign-assets.js';
import { currentCampaign } from '../server/campaign-scope.js';
import { withCampaign } from '../server/campaign-scope.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { json, sessionFor } from '../server/http.js';
import { requestedMap, requireMap } from '../server/map-pages.js';
import { StoreError } from '../server/pin-store.js';

async function handler(req, res) {
  if (!sessionFor(req)) return json(res, 401, { error: 'Entre na campanha para visualizar o mapa.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido.' });
  try {
    const campaign = await getCampaign(currentCampaign());
    const page = await requireMap(requestedMap(req));
    const map = page ? {...page.image,builtin:false} : campaign?.map;
    if (!map) return json(res, 404, {error:'Esta campanha ainda não possui mapa.'});
    const original = new URL(req.url || '/', 'http://local').searchParams.get('quality') === 'original';
    const asset = map.builtin ? null : await getAsset(map.id);
    if (!map.builtin && (!asset || asset.metadata.campaignId !== currentCampaign())) return json(res,404,{error:'Mapa indisponível.'});
    const image = asset ? Buffer.from(asset.data,'base64') : await readFile(resolve(original ? 'private/maps/imortais.webp' : 'private/maps/imortais-restored.png'));
    res.statusCode = 200;
    res.setHeader('Content-Type', asset || original ? 'image/webp' : 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', image.length);
    res.end(req.method === 'HEAD' ? undefined : image);
  } catch (error) { return json(res, error instanceof StoreError ? error.status : 503, { error: error instanceof StoreError ? error.message : 'O mapa está indisponível. Tente novamente.' }); }
}

export default withCampaign(handler);
