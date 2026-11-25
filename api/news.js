import { json,platformAdmin,readJson,sameOrigin } from '../server/http.js';
import { StoreError } from '../server/pin-store.js';
import { listCharacters,getCharacter } from '../server/feed-store.js';
import { readFeedSession } from '../server/feed-session.js';
import { listNews,getNews,publicNews,saveNews,deleteNews,listComments,addComment,deleteComment } from '../server/news-store.js';
export default async function handler(req,res){
  const url=new URL(req.url||'/','http://local'),action=url.searchParams.get('action'),id=url.searchParams.get('id');
  if(!['GET','POST','PATCH','DELETE'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
  if(req.method!=='GET'&&!sameOrigin(req))return json(res,403,{error:'Origem não permitida.'});
  const admin=platformAdmin(req);
  try{
    if(req.method==='GET'){
      if(action==='cover'){const record=await getNews(id,true);if(!record?.cover)return json(res,404,{error:'Capa indisponível.'});res.statusCode=200;res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.end(Buffer.from(record.cover,'base64'));}
      if(action==='comments'){const [timeline,characters]=await Promise.all([listComments(id,url.searchParams.get('before')),listCharacters()]);const characterId=readFeedSession(req);return json(res,200,{...timeline,characters,characterId:characters.some(item=>item.id===characterId)?characterId:null,admin});}
      if(action)return json(res,400,{error:'Ação inválida.'});
      if(id){const record=await getNews(id);if(!record)return json(res,404,{error:'Esta notícia não foi encontrada ou foi excluída.'});return json(res,200,{news:publicNews(record,true)});}
      return json(res,200,await listNews(url.searchParams.get('before'),url.searchParams.get('limit')));
    }
    if(!(req.method==='POST'&&action==='comment')&&!admin)return json(res,403,{error:'Entre como administrador da plataforma para gerenciar notícias.'});
    let body;try{body=await readJson(req,req.method==='POST'&&action==='comment'?8000:4_200_000);}catch{return json(res,400,{error:'Dados inválidos ou muito grandes.'});}
    if(action==='comment'){
      if(req.method==='POST'){const characterId=readFeedSession(req);if(!characterId||!await getCharacter(characterId))throw new StoreError(401,'Entre com um personagem do Xweeter para comentar.');return json(res,201,{comment:await addComment(characterId,body)});}
      if(req.method==='DELETE'){await deleteComment(body?.id);return json(res,200,{deleted:true});}
      return json(res,405,{error:'Método não permitido.'});
    }
    if(action)return json(res,400,{error:'Ação inválida.'});
    if(req.method==='DELETE'){await deleteNews(body?.id,body?.revision);return json(res,200,{deleted:true});}
    return json(res,req.method==='POST'?201:200,{news:await saveNews(body,req.method==='POST')});
  }catch(error){return json(res,error instanceof StoreError?error.status:503,{error:error instanceof StoreError?error.message:'Não foi possível acessar as notícias. Tente novamente.'});}
}
