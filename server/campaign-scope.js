import { AsyncLocalStorage } from 'node:async_hooks';
import { defaultCampaignId, validCampaignId } from '../shared/campaigns.js';
const scope = new AsyncLocalStorage();
export const currentCampaign = () => scope.getStore() || defaultCampaignId;
export const requestedCampaign = req => new URL(req.url || '/', 'http://local').searchParams.get('campaign') || defaultCampaignId;
export function withCampaign(handler) {
  return async (req, res) => {
    const id = requestedCampaign(req);
    if (!validCampaignId(id)) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Campanha inválida.' })); return; }
    try {
      const { getCampaign } = await import('./campaign-store.js');
      if (!await getCampaign(id)) { res.statusCode=404; res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify({error:'Campanha indisponível.'})); return; }
    } catch { res.statusCode=503; res.end(JSON.stringify({error:'O catálogo está indisponível.'})); return; }
    return scope.run(id, () => handler(req, res));
  };
}
export const inCampaign = (id, action) => scope.run(id, action);
