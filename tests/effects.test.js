import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import handler from '../api/map-state.js';
import {createSession,cookieNameFor} from '../api/campaign-access.js';
import {defaultCampaignId} from '../shared/campaigns.js';
import {defaultEffects,defaultHeader} from '../shared/effects.js';
import {sameMoment} from '../shared/atmosphere.js';
let directory,server,origin;
const secret='effects-test-secret-longer-than-thirty-two-characters';
const request=(campaign=defaultCampaignId,role='admin',body,headers={})=>fetch(`${origin}?campaign=${campaign}`,{method:body?'PATCH':'GET',headers:{Cookie:`${cookieNameFor(campaign)}=${createSession(secret,role,Date.now(),campaign)}`,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
const read=async(campaign=defaultCampaignId)=>(await(await request(campaign,'player')).json()).state;
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'dioos-effects-test-'));process.env.PIN_DATA_FILE=join(directory,'pins.json');process.env.SESSION_SECRET=secret;delete process.env.DATABASE_URL;delete process.env.VERCEL;
  await writeFile(process.env.PIN_DATA_FILE,JSON.stringify({version:1,pins:[],huntState:{day:7,period:'night',revision:4,updatedAt:null}}));
  server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/api/map-state`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('dioos-effects-test-'));await rm(directory,{recursive:true,force:true});});
test('legacy maps gain default effects and header without resetting dates or rewriting reads',async()=>{
  const before=await readFile(process.env.PIN_DATA_FILE,'utf8'),state=await read();assert.equal(state.day,7);assert.equal(state.revision,4);assert.deepEqual(state.effects,defaultEffects);assert.deepEqual(state.header,defaultHeader);assert.equal(await readFile(process.env.PIN_DATA_FILE,'utf8'),before);
});
test('only campaign administrators can save effects and header; foreign origins are rejected',async()=>{
  const patch={revision:4,effects:{...defaultEffects,redGlow:true},header:{label:'O inverno',dayLabel:'Noite',dateText:'12 de Ches, 1492'}};
  assert.equal((await request(defaultCampaignId,'player',patch)).status,403);
  assert.equal((await request(defaultCampaignId,'admin',patch,{Origin:'https://foreign.example'})).status,403);
  assert.equal((await request(defaultCampaignId,'admin',patch)).status,200);
  const state=await read();assert.equal(state.effects.redGlow,true);assert.deepEqual(state.header,patch.header);assert.equal(state.day,7);assert.equal(state.period,'night');
});
test('changing time preserves effects; changing effects preserves header, time and other campaigns',async()=>{
  let state=await read();assert.equal((await request(defaultCampaignId,'admin',{revision:state.revision,day:9,period:'morning'})).status,200);
  state=await read();assert.equal(state.effects.redGlow,true);assert.equal(state.header.dateText,'12 de Ches, 1492');
  assert.equal((await request('campanha-02','admin',{revision:0,effects:{...defaultEffects,fog:false,tvStatic:true}})).status,200);
  const other=await read('campanha-02');assert.equal(other.effects.tvStatic,true);assert.equal(other.effects.redGlow,false);assert.deepEqual(other.header,defaultHeader);assert.deepEqual(await read(),state);
});
test('malformed configurations and stale revisions cannot corrupt published settings',async()=>{
  const state=await read();
  for(const patch of [{effects:null},{effects:{...defaultEffects,fog:'yes'}},{effects:{...defaultEffects,intensity:101}},{effects:{...defaultEffects,intensity:1.5}},{effects:{...defaultEffects,unknown:true}},{header:{...defaultHeader,label:' '}},{header:{...defaultHeader,dateText:'x'.repeat(81)}},{header:{label:'Missing fields'}},{effects:[]},{header:null}])assert.equal((await request(defaultCampaignId,'admin',{revision:state.revision,...patch})).status,400);
  assert.equal((await request(defaultCampaignId,'admin',{revision:0,effects:defaultEffects})).status,409);assert.deepEqual(await read(),state);
});
test('concurrent clock and atmosphere edits require a refresh rather than overwriting each other',async()=>{
  const state=await read();const results=await Promise.all([{effects:{...state.effects,snow:true}},{header:{...state.header,label:'Calendário da campanha'}}].map(patch=>request(defaultCampaignId,'admin',{revision:state.revision,...patch})));assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.equal((await read()).revision,state.revision+1);
});
test('custom date changes trigger fog transition while label and effects changes do not',()=>{
  const state={day:7,period:'night',header:defaultHeader};
  assert.equal(sameMoment(state,{...state,header:{...defaultHeader,dateText:'Outono, 1492'}}),false);
  assert.equal(sameMoment(state,{...state,header:{...defaultHeader,label:'Outro título'},effects:{...defaultEffects,rain:true}}),true);
});
