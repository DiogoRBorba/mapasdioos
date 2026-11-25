import { json, readJson, sameOrigin, sessionFor } from '../server/http.js';
import { StoreError } from '../server/pin-store.js';
import { getCampaign } from '../server/campaign-store.js';
import { validCampaignId } from '../shared/campaigns.js';
import { readFeedSession } from '../server/feed-session.js';
import { listCharacters } from '../server/feed-store.js';
import { socialState, publicSocial, saveSocialCharacter, deleteSocialRecord, saveTask, saveRelation, updateTaskProgress, submitExam, savePortrait, getPortrait, awardPoints, createSocialXweeter, savePrivateNote } from '../server/social-store.js';

export default async function handler(req,res){
  const url=new URL(req.url||'/','http://local'),campaign=url.searchParams.get('campaign'),action=url.searchParams.get('action');
  if(!validCampaignId(campaign))return json(res,400,{error:'Campanha inválida.'});
  if(!['GET','POST','PATCH','DELETE'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
  if(req.method!=='GET'&&!sameOrigin(req))return json(res,403,{error:'Origem não permitida.'});
  try{
    const session=sessionFor(req,campaign);if(!session)return json(res,401,{error:'Entre na campanha para continuar.'});
    const record=await getCampaign(campaign);if(!record||record.type!=='social')return json(res,404,{error:'Campanha social indisponível.'});
    const admin=session.role==='admin',xweeterId=readFeedSession(req);
    if(req.method==='GET'){
      const {data}=await socialState(campaign);
      if(action==='portrait'){
        const id=url.searchParams.get('id');if(!admin&&!data.characters.some(item=>item.portraitId===id))return json(res,404,{error:'Retrato indisponível.'});
        const portrait=await getPortrait(campaign,id);if(!portrait)return json(res,404,{error:'Retrato indisponível.'});
        res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.end(Buffer.from(portrait.data,'base64'));
      }
      if(action)return json(res,400,{error:'Ação inválida.'});
      return json(res,200,{...publicSocial(data,xweeterId,admin),...(admin?{xweeters:await listCharacters()}:{})});
    }
    if(action==='progress')return json(res,403,{error:'Agora o Mestre controla os passos e o resultado da tarefa.'});
    if(['character','task','task-progress','portrait','points','xweeter'].includes(action)&&!admin)return json(res,403,{error:'Somente o Mestre pode editar o conteúdo da campanha.'});
    let body;try{body=await readJson(req,action==='portrait'?4_200_000:180_000);}catch{return json(res,400,{error:'Dados inválidos ou muito grandes.'});}
    if(req.method==='DELETE'){
      if(!admin||!['character','task'].includes(action))return json(res,403,{error:'Ação não permitida.'});
      await deleteSocialRecord(campaign,action,body?.id,body?.revision);return json(res,200,{deleted:true});
    }
    if(action==='character')return json(res,200,{character:await saveSocialCharacter(campaign,body)});
    if(action==='points')return json(res,200,{award:await awardPoints(campaign,body)});
    if(action==='xweeter')return json(res,200,{xweeter:await createSocialXweeter(campaign,body)});
    if(action==='task')return json(res,200,{task:await saveTask(campaign,body)});
    if(action==='task-progress')return json(res,200,{task:await updateTaskProgress(campaign,body)});
    if(action==='portrait')return json(res,201,{portrait:await savePortrait(campaign,body)});
    if(!xweeterId)return json(res,403,{error:'Selecione seu personagem e entre com a senha do Xweeter.'});
    if(action==='relation')return json(res,200,{relation:await saveRelation(campaign,xweeterId,body)});
    if(action==='note')return json(res,200,{note:await savePrivateNote(campaign,xweeterId,body)});
    if(action==='submit')return json(res,200,{submission:await submitExam(campaign,xweeterId,body)});
    return json(res,400,{error:'Ação inválida.'});
  }catch(error){return json(res,error instanceof StoreError?error.status:503,{error:error instanceof StoreError?error.message:'Não foi possível acessar a campanha social. Tente novamente.'});}
}
