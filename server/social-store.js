import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { database, assertStorage, StoreError } from './pin-store.js';
import { isUuid, getCharacter, createCharacter, publicCharacter } from './feed-store.js';

const empty = () => ({ characters:[], tasks:[], relations:[], progress:[], submissions:[] });
const directory = () => join(dirname(resolve(process.env.PIN_DATA_FILE || '.data/imortais-pins.json')), 'social');
let ready, queue=Promise.resolve();
async function dbReady() {
  const db=await database();
  if(!ready)ready=(async()=>{
    await db`CREATE TABLE IF NOT EXISTS dioos_social (campaign_id text PRIMARY KEY, data jsonb NOT NULL, revision integer NOT NULL DEFAULT 0)`;
    await db`CREATE TABLE IF NOT EXISTS dioos_social_portraits (id uuid PRIMARY KEY, campaign_id text NOT NULL, data text NOT NULL)`;
  })().catch(error=>{ready=undefined;throw error;});
  await ready;return db;
}
async function local(campaign) {
  try{return JSON.parse(await readFile(join(directory(),`${campaign}.json`),'utf8'));}
  catch(error){if(error.code==='ENOENT')return {data:empty(),revision:0};throw error;}
}
export async function socialState(campaign) {
  assertStorage();
  if(process.env.DATABASE_URL){const db=await dbReady();return (await db`SELECT data,revision FROM dioos_social WHERE campaign_id=${campaign}`)[0] || {data:empty(),revision:0};}
  await queue;return local(campaign);
}
async function mutate(campaign,action) {
  assertStorage();
  if(process.env.DATABASE_URL){
    const db=await dbReady();
    await db`INSERT INTO dioos_social(campaign_id,data) VALUES(${campaign},${JSON.stringify(empty())}::jsonb) ON CONFLICT DO NOTHING`;
    // Retry unrelated concurrent edits without overwriting another player's progress.
    for(let attempt=0;attempt<6;attempt++){
      const {data,revision}=await socialState(campaign);const result=action(data);
      const rows=await db`UPDATE dioos_social SET data=${JSON.stringify(data)}::jsonb,revision=revision+1 WHERE campaign_id=${campaign} AND revision=${revision} RETURNING revision`;
      if(rows.length)return result;
    }
    throw new StoreError(409,'A campanha está recebendo alterações. Tente novamente.');
  }
  const result=queue.then(async()=>{const record=await local(campaign);const result=action(record.data);record.revision++;await mkdir(directory(),{recursive:true});const path=join(directory(),`${campaign}.json`),temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(record));await rename(temp,path);return result;});
  queue=result.catch(()=>{});return result;
}
const fail=(text='Revise os dados informados.',status=400)=>{throw new StoreError(status,text);};
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail();return value.trim();};
const uuid=value=>{if(!isUuid(value))fail('Identificador inválido.');return value;};
function checkRevision(old,input){if(!Number.isSafeInteger(input.revision)||input.revision<0)fail();if((old?.revision||0)!==input.revision)fail('Este registro mudou. Atualize a página e reabra o editor.',409);}
export function viewerFor(state,xweeterId){return state.characters.find(item=>item.kind==='player'&&item.xweeterId===xweeterId)||null;}
export function publicSocial(state,xweeterId,admin){
  const viewer=viewerFor(state,xweeterId);
  return {characters:state.characters,tasks:state.tasks.filter(task=>admin||task.status!=='draft'),relations:state.relations,
    notes:(state.notes||[]).filter(item=>admin||item.characterId===viewer?.id),
    progress:state.progress.filter(item=>admin||item.characterId===viewer?.id),
    submissions:state.submissions.filter(item=>admin||item.characterId===viewer?.id),viewerId:viewer?.id||null};
}
export async function saveSocialCharacter(campaign,input){
  if(!input)fail();uuid(input.id);
  const name=text(input.name,80,true),bio=text(input.bio,8000),tag=text(input.tag,120);
  if(!['player','npc'].includes(input.kind))fail();
  const xweeterId=uuid(input.xweeterId);
  if(!await getCharacter(xweeterId))fail('Vincule ou crie um Xweeter para este personagem.');
  const portraitId=input.portraitId?uuid(input.portraitId):null;
  if(portraitId&&!await getPortrait(campaign,portraitId))fail('Este retrato não pertence à campanha.');
  return mutate(campaign,state=>{
    const old=state.characters.find(item=>item.id===input.id);checkRevision(old,input);
    if(old&&old.kind!==input.kind)fail('O tipo de um personagem existente não pode ser trocado.');
    if(state.characters.some(item=>item.id!==input.id&&item.xweeterId===xweeterId))fail('Este Xweeter já está vinculado a outro personagem nesta campanha.');
    if(!old&&state.characters.length>=100)fail('Limite de 100 personagens por campanha atingido.');
    const next={id:input.id,name,bio,tag,kind:input.kind,xweeterId,portraitId,points:old?.points||0,revision:(old?.revision||0)+1};
    if(old)state.characters[state.characters.indexOf(old)]=next;else state.characters.push(next);
    return next;
  });
}
export async function createSocialXweeter(campaign,input){
  if(!input)fail();uuid(input.id);
  // The editor reuses its request ID, so retrying a lost response cannot create a duplicate account.
  const existing=await getCharacter(input.id);if(existing)return publicCharacter(existing);
  const portrait=input.portraitId?await getPortrait(campaign,uuid(input.portraitId)):null;
  if(input.portraitId&&!portrait)fail('Retrato indisponível.');
  try{return await createCharacter({id:input.id,name:input.name,password:input.password,color:input.color,...(portrait?{image:portrait.data}:{})});}
  catch(error){if(error.status===409){const saved=await getCharacter(input.id);if(saved)return publicCharacter(saved);}throw error;}
}
export async function awardPoints(campaign,input){
  if(!input)fail();uuid(input.id);
  if(input.target!=='all')uuid(input.target);
  if(!Number.isSafeInteger(input.amount)||input.amount===0||Math.abs(input.amount)>10000)fail('Adicione ou retire de 1 a 10.000 pontos por vez.');
  return mutate(campaign,state=>{
    state.awards??=[];
    const previous=state.awards.find(item=>item.id===input.id);
    if(previous){if(previous.target!==input.target||previous.amount!==input.amount)fail('Esta concessão já foi usada.',409);return previous;}
    const recipients=state.characters.filter(item=>item.kind==='player'&&(input.target==='all'||item.id===input.target));
    if(!recipients.length)fail('Selecione um personagem jogador.');
    if(state.awards.length>=10000)fail('Limite de concessões desta campanha atingido.');
    if(recipients.some(item=>Math.abs((item.points||0)+input.amount)>1_000_000_000))fail('Limite de pontos atingido.');
    recipients.forEach(item=>{item.points=(item.points||0)+input.amount;});
    const award={id:input.id,target:input.target,amount:input.amount,recipients:recipients.map(item=>item.id),createdAt:new Date().toISOString()};
    state.awards.push(award);return award;
  });
}
export async function deleteSocialRecord(campaign,kind,id,revision){
  uuid(id);if(!['character','task'].includes(kind))fail();
  return mutate(campaign,state=>{
    const records=kind==='character'?state.characters:state.tasks,old=records.find(item=>item.id===id);
    if(!old)fail('Registro não encontrado.',404);checkRevision(old,{revision});records.splice(records.indexOf(old),1);
    if(kind==='character'){
      state.relations=state.relations.filter(item=>item.characterId!==id&&item.npcId!==id);
      state.notes=(state.notes||[]).filter(item=>item.characterId!==id&&item.targetId!==id);
      state.progress=state.progress.filter(item=>item.characterId!==id);
      state.submissions=state.submissions.filter(item=>item.characterId!==id);
    }else{state.progress=state.progress.filter(item=>item.taskId!==id);state.submissions=state.submissions.filter(item=>item.taskId!==id);}
  });
}
export async function saveTask(campaign,input){
  if(!input)fail();uuid(input.id);const title=text(input.title,160,true),description=text(input.description,10000),due=text(input.due,100);
  if(!['activity','quest','exam'].includes(input.kind)||!['draft','published','closed','completed','failed'].includes(input.status))fail();
  if(input.kind==='exam'&&['completed','failed'].includes(input.status))fail('Provas usam os estados rascunho, publicada ou encerrada.');
  let steps;
  if(input.kind!=='exam'&&input.steps!==undefined){
    if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>20)fail('Adicione de 1 a 20 passos.');
    steps=input.steps.map(step=>{if(!step||typeof step.done!=='boolean')fail('Passo inválido.');return {id:uuid(step.id),description:text(step.description,2000,true),done:step.done};});
    if(new Set(steps.map(step=>step.id)).size!==steps.length)fail('Há passos duplicados.');
  }
  if(!Array.isArray(input.questions)||input.questions.length>30)fail('Use até 30 perguntas.');
  const questions=input.kind==='exam'?input.questions.map(q=>{
    uuid(q.id);const prompt=text(q.prompt,1500,true);if(!['text','choice'].includes(q.type)||typeof q.required!=='boolean')fail();
    if(!Array.isArray(q.options)||q.options.length>8)fail();
    const options=q.type==='choice'?q.options.map(value=>text(value,300,true)):[];
    if(q.type==='choice'&&(options.length<2||new Set(options).size!==options.length))fail('Cada pergunta de alternativas precisa de 2 a 8 opções diferentes.');
    return {id:q.id,prompt,type:q.type,required:q.required,options};
  }):[];
  if(new Set(questions.map(q=>q.id)).size!==questions.length)fail('Há perguntas duplicadas.');
  if(input.kind==='exam'&&questions.length===0)fail('Adicione pelo menos uma pergunta à prova.');
  return mutate(campaign,state=>{
    const old=state.tasks.find(item=>item.id===input.id);checkRevision(old,input);
    if(old&&old.kind!==input.kind)fail('O tipo de uma tarefa existente não pode ser trocado.');
    if(!old&&state.tasks.length>=200)fail('Limite de 200 tarefas atingido.');
    if(!old&&input.kind!=='exam'&&!steps)fail('Adicione de 1 a 20 passos.');
    const next={id:input.id,title,description,due,kind:input.kind,status:input.status,questions,steps:input.kind==='exam'?[]:steps??old?.steps??[],revision:(old?.revision||0)+1};
    if(old)state.tasks[state.tasks.indexOf(old)]=next;else state.tasks.unshift(next);return next;
  });
}
function player(state,xweeterId,actorId){const character=viewerFor(state,xweeterId);if(!character||character.id!==actorId)fail('Entre com o Xweeter vinculado ao seu personagem nesta campanha.',403);return character;}
export async function savePrivateNote(campaign,xweeterId,input){
  if(!input||Object.keys(input).some(key=>!['actorId','targetId','text','revision'].includes(key)))fail();
  uuid(input.targetId);const content=text(input.text,4000);
  return mutate(campaign,state=>{
    const character=player(state,xweeterId,input.actorId);
    if(!state.characters.some(item=>item.id===input.targetId))fail('Personagem não encontrado.',404);
    state.notes??=[];
    const previous=state.notes.find(item=>item.characterId===character.id&&item.targetId===input.targetId);checkRevision(previous,input);
    const next={characterId:character.id,targetId:input.targetId,text:content,revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString()};
    if(previous)Object.assign(previous,next);else state.notes.push(next);
    return next;
  });
}
export async function saveRelation(campaign,xweeterId,input){
  if(!input||!isUuid(input.npcId)||!Number.isInteger(input.value)||input.value < -5||input.value>5||Object.keys(input).some(key=>!['npcId','value','actorId'].includes(key)))fail('Escolha de zero a cinco corações ou caveirinhas.');
  return mutate(campaign,state=>{
    const character=player(state,xweeterId,input.actorId);if(!state.characters.some(item=>item.id===input.npcId))fail('Personagem não encontrado.',404);
    const old=state.relations.find(item=>item.characterId===character.id&&item.npcId===input.npcId);
    const next={characterId:character.id,npcId:input.npcId,value:input.value};if(old)Object.assign(old,next);else state.relations.push(next);return next;
  });
}
export async function updateTaskProgress(campaign,input){
  if(!input||!isUuid(input.taskId)||Object.keys(input).some(key=>!['taskId','revision','stepId','done','status'].includes(key)))fail();
  const changingStatus=input.status!==undefined;
  if(changingStatus){if(!['published','completed','failed'].includes(input.status)||input.stepId!==undefined||input.done!==undefined)fail();}
  else if(!isUuid(input.stepId)||typeof input.done!=='boolean')fail();
  return mutate(campaign,state=>{
    const task=state.tasks.find(item=>item.id===input.taskId);
    if(!task||task.kind==='exam')fail('Atividade ou quest não encontrada.',404);
    checkRevision(task,input);
    if(changingStatus)task.status=input.status;
    else{
      if(['completed','failed','closed'].includes(task.status))fail('Reabra a tarefa antes de alterar os passos.');
      const step=task.steps?.find(item=>item.id===input.stepId);if(!step)fail('Passo não encontrado.',404);step.done=input.done;
    }
    task.revision++;return task;
  });
}
export async function submitExam(campaign,xweeterId,input){
  if(!input||!isUuid(input.taskId)||!input.answers||typeof input.answers!=='object'||Array.isArray(input.answers)||Object.keys(input).some(key=>!['taskId','revision','answers','actorId'].includes(key)))fail();
  return mutate(campaign,state=>{
    const character=player(state,xweeterId,input.actorId),task=state.tasks.find(item=>item.id===input.taskId);
    if(!task||task.kind!=='exam'||task.status!=='published')fail('Esta prova não está aberta para respostas.');
    checkRevision(task,input);
    if(Object.keys(input.answers).some(id=>!task.questions.some(q=>q.id===id)))fail('Há respostas que não pertencem a esta prova.');
    const answers=task.questions.map(question=>{
      const answer=text(input.answers[question.id]??'',4000,question.required);
      if(question.type==='choice'&&answer&&!question.options.includes(answer))fail('Alternativa inválida.');
      return {questionId:question.id,prompt:question.prompt,answer};
    });
    const old=state.submissions.find(item=>item.characterId===character.id&&item.taskId===task.id);
    if(!old&&state.submissions.length>=2000)fail('Limite de respostas da campanha atingido.');
    const next={taskId:task.id,characterId:character.id,title:task.title,taskRevision:task.revision,answers,submittedAt:new Date().toISOString()};
    if(old)state.submissions[state.submissions.indexOf(old)]=next;else state.submissions.push(next);return next;
  });
}
export async function savePortrait(campaign,input){
  assertStorage();if(!input||typeof input.data!=='string'||input.data.length>4_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data))fail('Envie um retrato JPG, PNG ou WebP.');
  let data;
  try{const image=sharp(Buffer.from(input.data,'base64'),{limitInputPixels:40_000_000}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw new Error();data=(await image.rotate().resize({width:800,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer()).toString('base64');}catch{fail('Use um retrato JPG, PNG ou WebP válido.');}
  const id=randomUUID();
  if(process.env.DATABASE_URL){const db=await dbReady();await db`INSERT INTO dioos_social_portraits(id,campaign_id,data) VALUES(${id},${campaign},${data})`;}
  else{const path=join(directory(),'portraits',campaign);await mkdir(path,{recursive:true});await writeFile(join(path,`${id}.json`),JSON.stringify({data}),{flag:'wx'});}
  return {id};
}
export async function getPortrait(campaign,id){
  if(!isUuid(id))return null;assertStorage();
  if(process.env.DATABASE_URL){const db=await dbReady();return (await db`SELECT data FROM dioos_social_portraits WHERE id=${id} AND campaign_id=${campaign}`)[0]||null;}
  try{return JSON.parse(await readFile(join(directory(),'portraits',campaign,`${id}.json`),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
