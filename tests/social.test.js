import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import handler from '../api/social.js';
import mapState from '../api/map-state.js';
import access,{createSession,cookieNameFor} from '../api/campaign-access.js';
import {createFeedSession} from '../server/feed-session.js';
import {createCharacter} from '../server/feed-store.js';
import {saveCampaign,publicCampaign,getCampaign,deleteCampaign} from '../server/campaign-store.js';
import {socialState} from '../server/social-store.js';
const a='social-test-a',b='social-test-b',secret='social-test-secret-at-least-thirty-two-characters',master='test-admin-only';
let dir,server,origin,alice,bob,npc,exam,activity,portrait;
const xa=randomUUID(),xb=randomUUID(),xn=randomUUID(),unlinked=randomUUID();
const campaignCookie=(id,role='admin')=>`${cookieNameFor(id)}=${createSession(secret,role,Date.now(),id)}`;
const admin=()=>campaignCookie(a),player=(id=xa,campaign=a)=>`${campaignCookie(campaign,'player')}; dioos_xweeter=${createFeedSession(id,secret)}`;
const request=(action='',method='GET',body,cookie=admin(),campaign=a,extra={})=>fetch(`${origin}/api/social?campaign=${campaign}${action?`&action=${action}`:''}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
const campaignForm=(id,type='social')=>({id,type,revision:0,title:'Campus de teste',subtitle:'',description:'',playerPassword:'test-players-only'});
const characterForm=(name,kind='npc',xweeterId=null)=>({id:randomUUID(),revision:0,name,bio:'História do teste',tag:'Estudante',kind,xweeterId,portraitId:null});
const taskForm=(kind='exam')=>({id:randomUUID(),revision:0,title:'Prova de Runas',description:'Instruções',due:'Dia 3',kind,status:'draft',steps:kind==='exam'?[]:[{id:randomUUID(),description:'Investigar o laboratório.',done:false}],questions:kind==='exam'?[{id:randomUUID(),prompt:'Explique sua resposta.',type:'text',required:true,options:[]},{id:randomUUID(),prompt:'Qual símbolo?',type:'choice',required:true,options:['Sol','Lua']}]:[]});
before(async()=>{
  dir=await mkdtemp(join(tmpdir(),'dioos-social-test-'));process.env.PIN_DATA_FILE=join(dir,'pins.json');process.env.SESSION_SECRET=secret;process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD=master;delete process.env.DATABASE_URL;delete process.env.VERCEL;
  await saveCampaign(campaignForm(a),{});await saveCampaign(campaignForm(b),{});
  for(const [id,name] of [[xa,'Alice'],[xb,'Bob'],[unlinked,'Outra pessoa'],[xn,'Professor']])await createCharacter({id,name,password:'test-character-only',color:'#927455'});
  server=createServer((req,res)=>new URL(req.url,'http://local').pathname==='/api/campaign-access'?access(req,res):new URL(req.url,'http://local').pathname==='/api/map-state'?mapState(req,res):handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(dir)).startsWith('dioos-social-test-'));await rm(dir,{recursive:true,force:true});});
test('social campaigns work without maps while legacy map campaigns and new shadow types retain their map behavior',async()=>{
  const social=publicCampaign(await getCampaign(a));assert.equal(social.type,'social');assert.equal(social.map,null);assert.equal(social.placeholder,false);
  for(const role of ['player','admin']){const response=await fetch(origin+'/api/campaign-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:a,role,password:role==='admin'?master:'test-players-only'})});assert.equal(response.status,200);}
  await saveCampaign(campaignForm('shadow-test','shadows'),{});assert.equal(publicCampaign(await getCampaign('shadow-test')).placeholder,true);
  assert.equal(publicCampaign(await getCampaign('a-ultima-valsa-dos-imortais')).type,'map');
  await assert.rejects(saveCampaign({...campaignForm('bad-type'),type:'unknown'},{}),{status:400});
  await assert.rejects(saveCampaign({...campaignForm('missing-password'),playerPassword:''},{}),{status:400});
  const before=await getCampaign(a);await saveCampaign({id:a,revision:before.revision,title:before.title,subtitle:'Updated',description:'',playerPassword:''},{});assert.equal((await getCampaign(a)).type,'social');
});
test('social data requires campaign-scoped login and all content writes require its administrator',async()=>{
  assert.equal((await request('', 'GET',undefined,null)).status,401);
  for(const cookie of [campaignCookie(b),campaignCookie('platform')])assert.equal((await request('', 'GET',undefined,cookie)).status,401);
  assert.equal((await request('','GET',undefined,campaignCookie('a-ultima-valsa-dos-imortais'),'a-ultima-valsa-dos-imortais')).status,404);
  for(const action of ['character','task','portrait','points','xweeter'])assert.equal((await request(action,'POST',{},player())).status,403);
  assert.equal((await request('character','POST',{},admin(),a,{Origin:'https://foreign.example'})).status,403);
});
test('admin creates NPCs and player profiles linked to unique, existing Xweeters',async()=>{
  for(const [name,kind,xid] of [['Alice','player',xa],['Bob','player',xb],['Professor','npc',xn]]){const response=await request('character','POST',characterForm(name,kind,xid));assert.equal(response.status,200);const value=(await response.json()).character;if(name==='Alice')alice=value;else if(name==='Bob')bob=value;else npc=value;}
  assert.equal((await request('character','POST',characterForm('Duplicate','player',xa))).status,400);
  assert.equal((await request('character','POST',characterForm('Unknown','player',randomUUID()))).status,400);
  const data=await(await request('','GET',undefined,player())).json();assert.equal(data.viewerId,alice.id);assert.equal(data.characters.length,3);assert.equal(data.xweeters,undefined);assert.ok(!JSON.stringify(data).includes('password_hash'));
  assert.equal((await(await request('','GET',undefined,player(unlinked))).json()).viewerId,null);
});
test('each player owns their affinity scores; all campaign members can read them',async()=>{
  for(const [who,actorId,value] of [[xa,alice.id,4],[xb,bob.id,-3]])assert.equal((await request('relation','POST',{actorId,npcId:npc.id,value},player(who))).status,200);
  const data=await(await request('','GET',undefined,player())).json();assert.equal(data.relations.length,2);assert.equal(data.relations.find(r=>r.characterId===bob.id).value,-3);
  assert.equal((await request('relation','POST',{actorId:bob.id,npcId:npc.id,value:5},player())).status,403);
  assert.equal((await request('relation','POST',{actorId:alice.id,npcId:npc.id,value:5},player(unlinked))).status,403);
  assert.equal((await request('relation','POST',{actorId:alice.id,npcId:npc.id,value:8},player())).status,400);
  assert.equal((await request('relation','POST',{actorId:alice.id,npcId:randomUUID(),value:1},player())).status,404);
  assert.equal((await request('relation','POST',{actorId:alice.id,npcId:npc.id,value:0},player())).status,200);
  assert.equal((await socialState(a)).data.relations.find(r=>r.characterId===alice.id).value,0);
});
test('concurrent players save independently and another campaign cannot reference these characters',async()=>{
  const responses=await Promise.all([request('relation','POST',{actorId:alice.id,npcId:npc.id,value:5},player()),request('relation','POST',{actorId:bob.id,npcId:npc.id,value:-5},player(xb))]);for(const response of responses)assert.equal(response.status,200);
  const rows=(await socialState(a)).data.relations;assert.equal(rows.find(r=>r.characterId===alice.id).value,5);assert.equal(rows.find(r=>r.characterId===bob.id).value,-5);
  assert.equal((await request('relation','POST',{actorId:alice.id,npcId:npc.id,value:1},player(xa,b),b)).status,403);assert.equal((await socialState(b)).data.relations.length,0);
});
test('portraits are optimized, private to the campaign and only exposed to players after association',async()=>{
  const image=(await sharp({create:{width:1200,height:1400,channels:3,background:'#775599'}}).png().toBuffer()).toString('base64');
  assert.equal((await request('portrait','POST',{data:'bad'})).status,400);
  const response=await request('portrait','POST',{data:image});assert.equal(response.status,201);portrait=(await response.json()).portrait;
  const url=`${origin}/api/social?campaign=${a}&action=portrait&id=${portrait.id}`;
  assert.equal((await fetch(url,{headers:{Cookie:player()}})).status,404);
  const result=await request('character','POST',{...npc,portraitId:portrait.id});npc=(await result.json()).character;
  const actual=await fetch(url,{headers:{Cookie:player()}});assert.equal(actual.status,200);assert.equal(actual.headers.get('content-type'),'image/webp');const meta=await sharp(Buffer.from(await actual.arrayBuffer())).metadata();assert.ok(meta.width<=800&&meta.height<=1000);
  assert.equal((await fetch(url.replace(`campaign=${a}`,`campaign=${b}`),{headers:{Cookie:campaignCookie(b)}})).status,404);
});
test('character edits use revisions and retain relationships; stale saves cannot overwrite',async()=>{
  const previous=npc;const response=await request('character','POST',{...npc,name:'Professor atualizado'});assert.equal(response.status,200);npc=(await response.json()).character;
  assert.equal((await request('character','POST',{...previous,name:'Stale'})).status,409);assert.equal((await socialState(a)).data.relations.length,2);
  assert.equal((await request('character','POST',{...npc,kind:'player',xweeterId:unlinked})).status,400);
});
test('teacher drafts are hidden and only published exams accept validated answers',async()=>{
  const response=await request('task','POST',taskForm());assert.equal(response.status,200);exam=(await response.json()).task;
  assert.equal((await(await request('','GET',undefined,player())).json()).tasks.length,0);
  assert.equal((await request('submit','POST',{actorId:alice.id,taskId:exam.id,revision:exam.revision,answers:{}},player())).status,400);
  exam=(await(await request('task','POST',{...exam,status:'published'})).json()).task;
  assert.equal((await(await request('','GET',undefined,player())).json()).tasks.length,1);
  const answer={[exam.questions[0].id]:'Minha resposta',[exam.questions[1].id]:'Lua'};
  for(const answers of [{},{...answer,[exam.questions[1].id]:'Inventada'},{...answer,unknown:'oops'},{...answer,[exam.questions[0].id]:'x'.repeat(4001)}])assert.equal((await request('submit','POST',{actorId:alice.id,taskId:exam.id,revision:exam.revision,answers},player())).status,400);
  assert.equal((await request('submit','POST',{actorId:bob.id,taskId:exam.id,revision:exam.revision,answers:answer},player())).status,403);
  assert.equal((await request('submit','POST',{actorId:alice.id,taskId:exam.id,revision:0,answers:answer},player())).status,409);
  assert.equal((await request('submit','POST',{actorId:alice.id,taskId:exam.id,revision:exam.revision,answers:answer},player())).status,200);
});
test('exam answers are private to the submitting character and the teacher; re-submission replaces only their own answers',async()=>{
  assert.equal((await(await request('','GET',undefined,player(xb))).json()).submissions.length,0);
  assert.equal((await(await request()).json()).submissions.length,1);
  const answers={[exam.questions[0].id]:'Resposta revisada',[exam.questions[1].id]:'Sol'};
  assert.equal((await request('submit','POST',{actorId:alice.id,taskId:exam.id,revision:exam.revision,answers},player())).status,200);
  const state=(await socialState(a)).data;assert.equal(state.submissions.length,1);assert.equal(state.submissions[0].answers[0].answer,'Resposta revisada');
  exam=(await(await request('task','POST',{...exam,status:'closed'})).json()).task;
  assert.equal((await request('submit','POST',{actorId:alice.id,taskId:exam.id,revision:exam.revision,answers},player())).status,400);
  assert.equal((await(await request('','GET',undefined,player())).json()).submissions[0].answers[0].prompt,'Explique sua resposta.');
});
test('only the teacher can update shared activity steps; players see the same progress',async()=>{
  activity=(await(await request('task','POST',{...taskForm('activity'),status:'published'})).json()).task;
  const body={taskId:activity.id,revision:activity.revision,stepId:activity.steps[0].id,done:true};
  assert.equal((await request('task-progress','POST',body,player())).status,403);
  assert.equal((await request('progress','POST',{actorId:alice.id,taskId:activity.id,done:true},player())).status,403);
  assert.equal((await request('task-progress','POST',body,campaignCookie(b),b)).status,404);
  const response=await request('task-progress','POST',body);assert.equal(response.status,200);activity=(await response.json()).task;
  assert.equal(activity.steps[0].done,true);assert.equal(activity.status,'published');
  for(const who of [xa,xb]){const state=await(await request('','GET',undefined,player(who))).json();assert.equal(state.tasks.find(t=>t.id===activity.id).steps[0].done,true);}
  assert.equal((await request('task-progress','POST',{...body,done:false})).status,409);
});

test('teacher can complete or fail tasks with pending steps and reopen them without losing progress',async()=>{
  const quest=(await(await request('task','POST',{...taskForm('quest'),status:'published'})).json()).task;
  let current=quest;
  for(const status of ['completed','published','failed']){const response=await request('task-progress','POST',{taskId:current.id,revision:current.revision,status});assert.equal(response.status,200);current=(await response.json()).task;assert.equal(current.status,status);assert.equal(current.steps[0].done,false);}
  assert.equal((await request('task-progress','POST',{taskId:current.id,revision:current.revision,stepId:current.steps[0].id,done:true})).status,400);
  for(const who of [xa,xb])assert.equal((await(await request('','GET',undefined,player(who))).json()).tasks.find(t=>t.id===quest.id).status,'failed');
  const response=await request('task-progress','POST',{taskId:activity.id,revision:activity.revision,status:'completed'});activity=(await response.json()).task;assert.equal(activity.status,'completed');assert.equal(activity.steps[0].done,true);
});

test('steps enforce limits, descriptions, unique IDs and revisions while exams retain their behavior',async()=>{
  const step={id:randomUUID(),description:'Encontrar as pistas.',done:false};
  for(const steps of [[],Array.from({length:21},()=>({...step,id:randomUUID()})),[step,step],[{...step,description:''}],[{...step,description:'x'.repeat(2001)}],[{...step,done:'yes'}]])assert.equal((await request('task','POST',{...taskForm('quest'),steps})).status,400);
  const response=await request('task','POST',{...taskForm('quest'),steps:Array.from({length:20},()=>({...step,id:randomUUID()}))});assert.equal(response.status,200);
  const saved=(await response.json()).task;
  assert.equal((await request('task','POST',{...saved,revision:0})).status,409);
  assert.equal((await request('task-progress','POST',{taskId:exam.id,revision:exam.revision,status:'completed'})).status,404);
  assert.equal((await request('task','POST',{...exam,status:'failed'})).status,400);
  assert.equal((await request('task-progress','POST',{taskId:saved.id,revision:saved.revision,stepId:randomUUID(),done:true})).status,404);
  assert.equal((await request('task-progress','POST',{taskId:saved.id,revision:saved.revision,status:'completed',done:true})).status,400);
  const {steps,...withoutSteps}=saved;const preserved=await request('task','POST',{...withoutSteps,title:'Atualizada'});assert.equal(preserved.status,200);assert.deepEqual((await preserved.json()).task.steps,steps);
});

test('task validation rejects duplicate question IDs, empty alternatives, oversized exams and stale changes',async()=>{
  for(const patch of [{questions:[]},{questions:[{...exam.questions[0]}, {...exam.questions[0]}]},{questions:[{...exam.questions[1],options:['Same','Same']}]},{questions:Array.from({length:31},()=>({...exam.questions[0],id:randomUUID()}))}])assert.equal((await request('task','POST',{...taskForm(),...patch})).status,400);
  assert.equal((await request('task','POST',{...exam,revision:0})).status,409);
});
test('players and NPCs both appear in relationships with independent scores',async()=>{
  assert.equal((await request('relation','POST',{actorId:alice.id,npcId:bob.id,value:2},player())).status,200);
  const state=(await socialState(a)).data;assert.equal(state.relations.find(r=>r.characterId===alice.id&&r.npcId===bob.id).value,2);
  assert.equal((await request('relation','POST',{actorId:npc.id,npcId:alice.id,value:3},player(xn))).status,403);
});

test('points are admin-only, cumulative, isolated by campaign and safe to retry',async()=>{
  const first={id:randomUUID(),target:alice.id,amount:10};
  assert.equal((await request('points','POST',first,player())).status,403);
  assert.equal((await request('points','POST',{...first,target:npc.id})).status,400);
  for(const amount of [-10001,0,1.5,10001])assert.equal((await request('points','POST',{...first,amount})).status,400);
  for(const response of await Promise.all([request('points','POST',first),request('points','POST',first)]))assert.equal(response.status,200);
  assert.equal((await request('points','POST',{...first,amount:20})).status,409);
  const group={id:randomUUID(),target:'all',amount:5};
  const individual={id:randomUUID(),target:alice.id,amount:2};
  for(const response of await Promise.all([request('points','POST',group),request('points','POST',individual)]))assert.equal(response.status,200);
  let data=await(await request('','GET',undefined,player())).json();assert.equal(data.characters.find(c=>c.id===alice.id).points,17);assert.equal(data.characters.find(c=>c.id===npc.id).points,0);assert.equal(data.characters.find(c=>c.id===bob.id).points,5);
  assert.equal((await request('points','POST',individual,campaignCookie(b),b)).status,400);
  const response=await request('character','POST',{...alice,name:'Alice revisada',points:999});assert.equal(response.status,200);alice=(await response.json()).character;assert.equal(alice.points,17);
  assert.equal((await socialState(a)).data.awards.length,3);
});

test('admin can create a reusable Xweeter for any social character with safe retries',async()=>{
  const form={id:randomUUID(),name:'Novo NPC social',password:'new-social-test-only',color:'#558899',portraitId:portrait.id};
  const result=await request('xweeter','POST',form);assert.equal(result.status,200);const account=(await result.json()).xweeter;assert.ok(account.avatar);assert.equal(account.password,undefined);
  const retry=await request('xweeter','POST',form);assert.equal(retry.status,200);assert.equal((await retry.json()).xweeter.id,account.id);
  const saved=await request('character','POST',characterForm(form.name,'npc',account.id));assert.equal(saved.status,200);
  assert.equal((await request('character','POST',characterForm('Missing account','npc',null))).status,400);
  assert.equal((await request('xweeter','POST',{...form,id:randomUUID(),portraitId:randomUUID()})).status,400);
});

test('point deductions are admin-only, support group penalties and retry without double charging',async()=>{
  const debit={id:randomUUID(),target:alice.id,amount:-20};
  assert.equal((await request('points','POST',debit,player())).status,403);
  for(const response of await Promise.all([request('points','POST',debit),request('points','POST',debit)]))assert.equal(response.status,200);
  assert.equal((await request('points','POST',{id:randomUUID(),target:'all',amount:-2})).status,200);
  const data=(await socialState(a)).data;assert.equal(data.characters.find(c=>c.id===alice.id).points,-5);assert.equal(data.characters.find(c=>c.id===bob.id).points,3);assert.equal(data.characters.find(c=>c.id===npc.id).points,0);
});

test('private diary notes are scoped to their owner and the campaign master, never other players',async()=>{
  const body={actorId:alice.id,targetId:npc.id,text:'Anotação secreta de Alice.',revision:0};
  assert.equal((await request('note','POST',body,player())).status,200);
  assert.equal((await request('note','POST',{...body,actorId:bob.id,text:'Anotação de Bob.'},player(xb))).status,200);
  const own=await(await request('','GET',undefined,player())).json();assert.equal(own.notes.length,1);assert.equal(own.notes[0].text,body.text);
  const other=await(await request('','GET',undefined,player(xb))).json();assert.equal(other.notes.length,1);assert.ok(!JSON.stringify(other).includes(body.text));
  assert.equal((await(await request()).json()).notes.length,2);
  assert.deepEqual((await(await request('','GET',undefined,campaignCookie(a,'player'))).json()).notes,[]);
  assert.equal((await request('note','POST',{...body,revision:1},player(xb))).status,403);
  assert.equal((await request('note','POST',body,admin())).status,403);
  assert.equal((await request('note','POST',body,player(xa,b),b)).status,403);
  assert.equal((await request('note','POST',{...body,targetId:randomUUID()},player())).status,404);
});

test('notes validate content and revisions and blank saves safely clear the private text',async()=>{
  const body={actorId:alice.id,targetId:npc.id,revision:1,text:'Revisada'};
  assert.equal((await request('note','POST',{...body,text:'x'.repeat(4001)},player())).status,400);
  assert.equal((await request('note','POST',{...body,characterId:bob.id},player())).status,400);
  assert.equal((await request('note','POST',{...body,revision:0},player())).status,409);
  assert.equal((await request('note','POST',{...body,text:''},player())).status,200);
  assert.equal((await request('note','POST',body,player())).status,409);
  const data=await(await request('','GET',undefined,player())).json();assert.equal(data.notes[0].text,'');assert.equal(data.notes[0].revision,2);
});

test('social campus calendar shares the map day and period without requiring a map',async()=>{
  const clock=(campaign,cookie,body)=>fetch(`${origin}/api/map-state?campaign=${campaign}`,{method:body?'PATCH':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const before=(await(await clock(a,admin())).json()).state;
  const body={revision:before.revision,day:8,period:'night',header:{label:'Calendário escolar',dayLabel:'Dia letivo',dateText:''}};
  assert.equal((await clock(a,player(),body)).status,403);
  assert.equal((await clock(a,admin(),body)).status,200);
  const current=(await(await clock(a,player())).json()).state;assert.equal(current.day,8);assert.equal(current.period,'night');assert.deepEqual(current.header,body.header);assert.deepEqual(current.effects,before.effects);
  assert.equal((await clock(a,admin(),body)).status,409);
  assert.equal((await(await clock(b,campaignCookie(b))).json()).state.day,1);
});

test('deletions clear associated campaign records and deleted campaigns become inaccessible',async()=>{
  assert.equal((await request('character','DELETE',{id:npc.id,revision:npc.revision},player())).status,403);
  assert.equal((await request('character','DELETE',{id:npc.id,revision:npc.revision})).status,200);assert.equal((await socialState(a)).data.relations.length,1);assert.equal((await socialState(a)).data.notes.length,0);
  assert.equal((await request('task','DELETE',{id:exam.id,revision:exam.revision})).status,200);assert.equal((await socialState(a)).data.submissions.length,0);
  assert.equal((await request('character','DELETE',{id:alice.id,revision:alice.revision})).status,200);assert.equal((await socialState(a)).data.progress.length,0);
  const campaign=await getCampaign(a);await deleteCampaign(a,campaign.revision);assert.equal((await request()).status,404);
});
