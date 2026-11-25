import { withCampaign } from '../server/campaign-scope.js';
import { json, readJson, sameOrigin, sessionFor } from '../server/http.js';
import { getHuntState, publishHuntState, StoreError } from '../server/pin-store.js';
import { validateHuntState } from '../shared/hunt.js';

async function handler(req, res) {
  const session = sessionFor(req);
  if (!session) return json(res, 401, { error: 'Seu acesso expirou. Entre na campanha novamente.' });
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return json(res, 405, { error: 'Método não permitido.' });
  }
  if (req.method === 'PATCH' && session.role !== 'admin') return json(res, 403, { error: 'Somente o administrador pode alterar as configurações do mapa.' });
  if (req.method === 'PATCH' && !sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
  try {
    if (req.method === 'GET') return json(res, 200, { state: await getHuntState() });
    let data;
    try { data = validateHuntState(await readJson(req)); }
    catch (error) { return json(res, 400, { error: error.message === 'BODY' || error instanceof SyntaxError ? 'Dados inválidos.' : error.message }); }
    return json(res, 200, { state: await publishHuntState(data) });
  } catch (error) {
    return json(res, error instanceof StoreError ? error.status : 503, { error: error instanceof StoreError ? error.message : 'Não foi possível sincronizar o dia e o período. Tente novamente.' });
  }
}

export default withCampaign(handler);
