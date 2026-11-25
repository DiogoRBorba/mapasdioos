import { json, platformAdmin, readJson, sameOrigin } from '../server/http.js';
import { getAsset, createAsset } from '../server/campaign-assets.js';
import { listCampaigns } from '../server/campaign-store.js';
import { StoreError } from '../server/pin-store.js';
export default async function handler(req,res) {
  if(!['GET','HEAD','POST'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
  const admin=platformAdmin(req);
  if(req.method==='POST'&&(!admin||!sameOrigin(req)))return json(res,403,{error:'Somente o administrador da plataforma pode enviar estas imagens.'});
  try{
    if(req.method==='POST'){
      let body;try{body=await readJson(req,4_200_000);}catch{return json(res,400,{error:'Arquivo inválido ou muito grande.'});}
      return json(res,201,{asset:await createAsset(body)});
    }
    const id=new URL(req.url||'/','http://local').searchParams.get('id');
    if(!admin&&!(await listCampaigns()).some(item=>item.cover?.id===id))return json(res,404,{error:'Imagem indisponível.'});
    const record=await getAsset(id);if(!record)return json(res,404,{error:'Imagem indisponível.'});
    const bytes=Buffer.from(record.data,'base64');res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Length',bytes.length);res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){return json(res,error instanceof StoreError?error.status:503,{error:error instanceof StoreError?error.message:'Não foi possível acessar a imagem.'});}
}
