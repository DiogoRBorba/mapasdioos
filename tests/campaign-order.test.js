import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import handler from '../api/campaigns.js';
import {createSession,cookieNameFor} from '../api/campaign-access.js';
import {deleteCampaign,saveCampaign} from '../server/campaign-store.js';
let directory,server,origin;
const secret='campaign-order-test-secret-over-thirty-two-characters';
const auth=(id='platform',role='admin')=>`${cookieNameFor(id)}=${createSession(secret,role,Date.now(),id)}`;
const request=(body,cookie=auth(),headers={})=>fetch(origin+(body?'?action=order':''),{method:body?'PATCH':'GET',headers:{Cookie:cookie,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
const catalog=async()=>await(await request()).json();
before(async()=>{directory=await mkdtemp(join(tmpdir(),'dioos-order-test-'));process.env.PIN_DATA_FILE=join(directory,'pins.json');process.env.SESSION_SECRET=secret;delete process.env.DATABASE_URL;delete process.env.VERCEL;server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/api/campaigns`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('dioos-order-test-'));await rm(directory,{recursive:true,force:true});});
test('deletions renumber the visible catalog without changing campaign identities',async()=>{
  await deleteCampaign('campanha-02',0);await deleteCampaign('campanha-04',0);
  const data=await catalog();assert.deepEqual(data.campaigns.map(item=>item.number),['01','02','03']);assert.deepEqual(data.campaigns.map(item=>item.id),['a-ultima-valsa-dos-imortais','campanha-03','campanha-05']);
});
test('reordering is restricted to platform administrators and same-origin writes',async()=>{
  const data=await catalog(),body={ids:data.campaigns.map(item=>item.id).reverse(),revision:data.orderRevision};
  for(const cookie of ['',auth('a-ultima-valsa-dos-imortais'),auth('a-ultima-valsa-dos-imortais','player')])assert.equal((await request(body,cookie)).status,403);
  assert.equal((await request(body,auth(),{Origin:'https://foreign.example'})).status,403);
  const response=await request(body);assert.equal(response.status,200);const next=await response.json();assert.deepEqual(next.campaigns.map(item=>item.id),body.ids);assert.deepEqual(next.campaigns.map(item=>item.number),['01','02','03']);assert.equal(next.orderRevision,1);
  const {campaignCatalog}=await import(`../server/campaign-store.js?reload=${Date.now()}`);assert.deepEqual((await campaignCatalog()).campaigns.map(item=>item.id),body.ids);
});
test('editing retains order and revision; newly created campaigns append without numeric gaps',async()=>{
  const before=await catalog(),item=before.campaigns[0];
  await saveCampaign({id:item.id,revision:item.revision,title:'Título revisado',subtitle:'',description:'',playerPassword:''},{});
  const edited=await catalog();assert.deepEqual(edited.campaigns.map(item=>item.id),before.campaigns.map(item=>item.id));assert.equal(edited.orderRevision,before.orderRevision);
  await saveCampaign({id:'nova-campanha',revision:0,title:'Nova história',subtitle:'',description:'',playerPassword:''},{});
  const next=await catalog();assert.equal(next.campaigns.at(-1).id,'nova-campanha');assert.deepEqual(next.campaigns.map(item=>item.number),['01','02','03','04']);
});
test('malformed, incomplete and stale order writes leave the catalog untouched',async()=>{
  const before=await catalog(),ids=before.campaigns.map(item=>item.id);
  for(const [body,status] of [[{ids:[...ids,ids[0]],revision:before.orderRevision},400],[{ids:ids.slice(1),revision:before.orderRevision},409],[{ids:[...ids.slice(1),'missing'],revision:before.orderRevision},409],[{ids,revision:-1},400],[{ids:ids.slice().reverse(),revision:0},409]])assert.equal((await request(body)).status,status);
  assert.deepEqual(await catalog(),before);
});
test('concurrent reorder requests have one winner and cannot overwrite campaign edits',async()=>{
  const before=await catalog(),ids=before.campaigns.map(item=>item.id);
  const results=await Promise.all([ids.slice().reverse(),[ids[1],ids[0],...ids.slice(2)]].map(order=>request({ids:order,revision:before.orderRevision})));
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);const after=await catalog();assert.equal(after.orderRevision,before.orderRevision+1);assert.equal(after.campaigns.find(item=>item.id==='campanha-05').title,'Título revisado');
});
test('deleting from a reordered catalog closes the numbering gap and keeps the other positions',async()=>{
  const before=await catalog(),removed=before.campaigns[1];await deleteCampaign(removed.id,removed.revision);
  const after=await catalog();assert.deepEqual(after.campaigns.map(item=>item.id),before.campaigns.filter(item=>item.id!==removed.id).map(item=>item.id));assert.deepEqual(after.campaigns.map(item=>item.number),['01','02','03']);
});
