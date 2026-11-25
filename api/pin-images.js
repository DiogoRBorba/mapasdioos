import { withCampaign } from '../server/campaign-scope.js';
import { json, readJson, sameOrigin, sessionFor } from '../server/http.js';
import { listPins, StoreError } from '../server/pin-store.js';
import { getPinImage, storePinImage } from '../server/pin-images.js';

async function handler(req, res) {
  const session = sessionFor(req);
  if (!session) return json(res, 401, { error: 'Entre na campanha para visualizar imagens.' });
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, POST'); return json(res, 405, { error: 'Método não permitido.' }); }
  if (req.method === 'POST' && (session.role !== 'admin' || !sameOrigin(req))) return json(res, 403, { error: 'Somente o administrador pode anexar imagens.' });
  try {
    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 4_200_000); } catch { return json(res, 400, { error: 'Arquivo inválido ou muito grande.' }); }
      return json(res, 201, { image: await storePinImage(body) });
    }
    const id = new URL(req.url || '/', 'http://local').searchParams.get('id');
    // Drafts and detached attachments are never exposed to players.
    if (session.role !== 'admin' && !(await listPins()).some(pin => pin.images?.some(image => image.id === id))) return json(res, 404, { error: 'Imagem indisponível.' });
    const image = await getPinImage(id);
    if (!image) return json(res, 404, { error: 'Imagem indisponível.' });
    const bytes = Buffer.from(image.data, 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Length', bytes.length);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) { return json(res, error instanceof StoreError ? error.status : 503, { error: error instanceof StoreError ? error.message : 'Não foi possível acessar a imagem. Tente novamente.' }); }
}

export default withCampaign(handler);
