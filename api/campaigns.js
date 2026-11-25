import { json, platformAdmin, readJson, sameOrigin } from '../server/http.js';
import { campaignCatalog, getCampaign, reorderCampaigns, publicCampaign, saveCampaign, deleteCampaign } from '../server/campaign-store.js';
import { confirmAdminPassword } from '../server/security.js';
import { getAsset } from '../server/campaign-assets.js';
import { StoreError } from '../server/pin-store.js';
export default async function handler(req,res) {
  if(!['GET','POST','PATCH','DELETE'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
  if(req.method!=='GET'&&(!platformAdmin(req)||!sameOrigin(req)))return json(res,403,{error:'Entre como administrador da plataforma para editar campanhas.'});
  try {
    const catalog=async()=>{const data=await campaignCatalog();return {...data,campaigns:data.campaigns.map(publicCampaign)};};
    if(req.method==='GET')return json(res,200,await catalog());
    let body;try{body=await readJson(req);}catch{return json(res,400,{error:'Dados inválidos.'});}
    if(req.method==='PATCH'&&new URL(req.url||'/','http://local').searchParams.get('action')==='order'){await reorderCampaigns(body?.ids,body?.revision);return json(res,200,await catalog());}
    if(req.method==='DELETE') { confirmAdminPassword(req,body?.password); await deleteCampaign(body?.id,body?.revision); return json(res,200,{deleted:true}); }
    const assets={};
    for(const kind of ['cover','map'])if(body?.[`${kind}Id`]){
      const asset=await getAsset(body[`${kind}Id`]);
      if(!asset||asset.metadata.kind!==kind||asset.metadata.campaignId!==body.id)return json(res,400,{error:'Esta imagem não pertence à campanha. Envie novamente.'});
      assets[kind]=asset.metadata;
    }
    const saved=await saveCampaign(body,assets);
    return json(res,200,{campaign:publicCampaign(await getCampaign(saved.id)||saved)});
  }catch(error){return json(res,error instanceof StoreError?error.status:503,{error:error instanceof StoreError?error.message:'Não foi possível salvar ou carregar as campanhas. Tente novamente.'});}
}
