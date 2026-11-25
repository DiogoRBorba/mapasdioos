import { json, readJson, platformAdmin, sameOrigin } from '../server/http.js';
import { StoreError } from '../server/pin-store.js';
import { checkPassword } from '../server/campaign-store.js';
import { checkAttempt, equalSecret } from '../server/security.js';
import { listCharacters, getCharacter, createCharacter, listPosts, createPost, purgeExpired } from '../server/feed-store.js';
import { readFeedSession, createFeedSession, feedCookie } from '../server/feed-session.js';

export default async function handler(req,res) {
  const url=new URL(req.url||'/','http://local'), action=url.searchParams.get('action');
  if(!['GET','POST','PATCH','DELETE'].includes(req.method) || (req.method==='PATCH' && action!=='character'))return json(res,405,{error:'Método não permitido.'});
  if(req.method!=='GET' && !sameOrigin(req))return json(res,403,{error:'Origem não permitida.'});
  try {
    if(req.method==='GET') {
      if(action==='cleanup') {
        if(!process.env.CRON_SECRET || !equalSecret(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`))return json(res,401,{error:'Acesso não autorizado.'});
        return json(res,200,{deleted:await purgeExpired()});
      }
      if(action==='avatar') {
        const character=await getCharacter(url.searchParams.get('id'),true);
        if(!character?.avatar)return json(res,404,{error:'Retrato indisponível.'});
        res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','public, max-age=86400');res.setHeader('X-Content-Type-Options','nosniff');return res.end(Buffer.from(character.avatar,'base64'));
      }
      if(action)return json(res,400,{error:'Ação inválida.'});
      const [characters,timeline]=await Promise.all([listCharacters(),listPosts(url.searchParams.get('before'))]);
      const id=readFeedSession(req);
      return json(res,200,{characters,...timeline,characterId:characters.some(character=>character.id===id)?id:null,serverTime:Date.now()});
    }
    if(req.method==='DELETE') {
      if(action!=='session')return json(res,400,{error:'Ação inválida.'});
      res.setHeader('Set-Cookie',feedCookie(req));return json(res,200,{characterId:null});
    }
    if(action==='character' && !platformAdmin(req))return json(res,403,{error:'Entre na administração para gerenciar os Xweeters.'});
    let body;try{body=await readJson(req,action==='character'?4_200_000:6000);}catch{return json(res,400,{error:'Dados inválidos ou muito grandes.'});}
    if(action==='character')return json(res,req.method==='PATCH'?200:201,{character:await createCharacter(body,req.method==='PATCH')});
    if(action==='session') {
      const clear=checkAttempt(req,'xweeter-login');
      if(typeof body?.password!=='string' || body.password.length>512)return json(res,400,{error:'Informe a senha do personagem.'});
      if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32)throw new StoreError(503,'O acesso está sendo preparado.');
      const character=await getCharacter(body.characterId);
      if(!character || !checkPassword(body.password,character.password_hash))throw new StoreError(401,'Senha incorreta para este personagem.');
      clear();res.setHeader('Set-Cookie',feedCookie(req,createFeedSession(character.id,process.env.SESSION_SECRET)));
      return json(res,200,{characterId:character.id});
    }
    if(action==='post') {
      const id=readFeedSession(req);if(!id)throw new StoreError(401,'Escolha um personagem e entre com a senha dele para publicar.');
      return json(res,201,{post:await createPost(id,body)});
    }
    return json(res,400,{error:'Ação inválida.'});
  } catch(error) {return json(res,error instanceof StoreError?error.status:503,{error:error instanceof StoreError?error.message:'Não foi possível acessar o mural. Tente novamente.'});}
}
