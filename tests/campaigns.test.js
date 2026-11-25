import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import access,{createSession,cookieNameFor} from '../api/campaign-access.js';
import campaigns from '../api/campaigns.js';
import assets from '../api/campaign-assets.js';
import pins from '../api/map-pins.js';
import hunt from '../api/map-state.js';
import mapImage from '../api/map-image.js';
import pinImages from '../api/pin-images.js';
import {defaultCampaignId as original} from '../shared/campaigns.js';
let directory,server,origin,assetA,assetB,coverA,created,pinA,imageA;
const secret='multi-campaign-test-secret-with-32-characters';
const master='test-master-password';
const a='campaign-test-a',b='campaign-test-b';
const auth=(id,role='admin')=>`${cookieNameFor(id)}=${createSession(secret,role,Date.now(),id)}`;
const request=(path,method='GET',cookie,body)=>fetch(`${origin}${path}`,{method,headers:{...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const form=(id,extra={})=>({id,revision:0,title:'Uma história',subtitle:'Além do véu',description:'Sinopse de teste',playerPassword:'players-only',...extra});
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'dioos-campaign-test-'));process.env.PIN_DATA_FILE=join(directory,'pins.json');process.env.SESSION_SECRET=secret;process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD=master;process.env.CAMPAIGN_IMORTAIS_PLAYER_PASSWORD='original-player';delete process.env.DATABASE_URL;delete process.env.VERCEL;
  const handlers={'/api/campaign-access':access,'/api/campaigns':campaigns,'/api/campaign-assets':assets,'/api/map-pins':pins,'/api/map-state':hunt,'/api/map-image':mapImage,'/api/pin-images':pinImages};
  server=createServer((req,res)=>handlers[new URL(req.url,'http://local').pathname](req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('dioos-campaign-test-'));await rm(directory,{recursive:true,force:true});});
test('catalog is public but campaign and player admins cannot manage the platform',async()=>{
  const list=await(await request('/api/campaigns')).json();assert.equal(list.campaigns.length,5);assert.equal(list.campaigns[0].map.width,1200);assert.ok(!JSON.stringify(list).includes('passwordHash'));
  for(const cookie of [undefined,auth(original),auth(original,'player')])assert.equal((await request('/api/campaigns','POST',cookie,form(a))).status,403);
  const login=await request('/api/campaign-access','POST',undefined,{campaignId:'platform',role:'admin',password:master});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/dioos_platform=/);
  assert.equal((await request('/api/campaign-access','POST',undefined,{campaignId:'platform',role:'player',password:master})).status,400);
});
test('campaign assets stay private as drafts and retain their map dimensions',async()=>{
  const data=(await sharp({create:{width:1800,height:900,channels:3,background:'#35402b'}}).png().toBuffer()).toString('base64');
  for(const [campaignId,kind] of [[a,'map'],[b,'map'],[a,'cover']]){
    const body={campaignId,kind,name:'Mapa de teste.png',data};assert.equal((await request('/api/campaign-assets','POST',auth(original),body)).status,403);
    const response=await request('/api/campaign-assets','POST',auth('platform'),body);assert.equal(response.status,201);const asset=(await response.json()).asset;assert.equal(asset.width,1800);assert.equal(asset.height,900);
    if(kind==='cover')coverA=asset;else if(campaignId===a)assetA=asset;else assetB=asset;
    assert.equal((await request(`/api/campaign-assets?id=${asset.id}`)).status,404);
  }
});
test('platform admin publishes independent campaigns, protects passwords, and rejects foreign assets',async()=>{
  assert.equal((await request('/api/campaigns','POST',auth('platform'),form(a,{mapId:assetB.id}))).status,400);
  assert.equal((await request('/api/campaigns','POST',auth('platform'),form(a,{mapId:assetA.id,playerPassword:master}))).status,400);
  const response=await request('/api/campaigns','POST',auth('platform'),form(a,{mapId:assetA.id,coverId:coverA.id}));assert.equal(response.status,200);created=(await response.json()).campaign;assert.equal(created.placeholder,false);assert.equal(created.subtitle,'Além do véu');assert.equal(created.map.width,1800);assert.equal(created.passwordHash,undefined);
  assert.equal((await request('/api/campaigns','POST',auth('platform'),form(b,{mapId:assetB.id}))).status,200);
  assert.equal((await request(`/api/campaign-assets?id=${coverA.id}`)).status,200);
  assert.equal((await request(`/api/campaign-assets?id=${assetA.id}`)).status,404);
  assert.equal((await request('/api/campaigns','POST',auth('platform'),form(a))).status,409);
});
test('each campaign has its own session; the same administrator password works across campaigns',async()=>{
  for(const id of [a,b])for(const role of ['admin','player']){
    const response=await request('/api/campaign-access','POST',undefined,{campaignId:id,role,password:role==='admin'?master:'players-only'});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(`/api/map-image?campaign=${id}`,'GET',cookie)).status,200);
    const other=id===a?b:a;assert.equal((await request(`/api/map-image?campaign=${other}`,'GET',cookie)).status,401);
  }
  assert.equal((await request(`/api/map-pins?campaign=${a}`,'GET',auth('platform'))).status,401);
});
test('pins, pin attachments and approved time are isolated even in concurrent requests',async()=>{
  const imageData=(await sharp({create:{width:40,height:40,channels:3,background:'#bbaa99'}}).png().toBuffer()).toString('base64');
  imageA=(await(await request(`/api/pin-images?campaign=${a}`,'POST',auth(a),{name:'Retrato.png',data:imageData})).json()).image;
  const payload={id:randomUUID(),title:'Local apenas A',description:'',category:'places',icon:'landmark',shape:'marker',color:'#d6bd8e',x:.3,y:.5,images:[imageA]};
  const responses=await Promise.all([request(`/api/map-pins?campaign=${a}`,'POST',auth(a),payload),request(`/api/map-state?campaign=${a}`,'PATCH',auth(a),{day:7,period:'night',revision:0}),request(`/api/map-state?campaign=${b}`,'PATCH',auth(b),{day:3,period:'morning',revision:0})]);for(const response of responses)assert.ok(response.ok);pinA=(await responses[0].json()).pin;
  assert.equal((await(await request(`/api/map-pins?campaign=${b}`,'GET',auth(b,'player'))).json()).pins.length,0);
  assert.equal((await(await request(`/api/map-state?campaign=${a}`,'GET',auth(a,'player'))).json()).state.day,7);
  assert.equal((await(await request(`/api/map-state?campaign=${b}`,'GET',auth(b,'player'))).json()).state.day,3);
  assert.equal((await request(`/api/pin-images?id=${imageA.id}&campaign=${b}`,'GET',auth(b))).status,404);
  assert.equal((await request(`/api/pin-images?id=${imageA.id}&campaign=${a}`,'GET',auth(a,'player'))).status,200);
  assert.equal((await request(`/api/map-pins?campaign=${b}`,'POST',auth(b),{...payload,id:randomUUID()})).status,400);
});
test('campaign editing preserves map, access and existing pins unless explicitly replaced',async()=>{
  const response=await request('/api/campaigns','PATCH',auth('platform'),form(a,{revision:created.revision,title:'Título atualizado',playerPassword:''}));assert.equal(response.status,200);
  const next=(await response.json()).campaign;assert.equal(next.revision,2);assert.equal(next.map.width,1800);
  assert.equal((await(await request(`/api/map-pins?campaign=${a}`,'GET',auth(a))).json()).pins[0].id,pinA.id);
  assert.equal((await request('/api/campaign-access','POST',undefined,{campaignId:a,role:'player',password:'players-only'})).status,200);
  const list=await(await request('/api/campaigns')).json();assert.ok(!JSON.stringify(list).includes('players-only'));assert.ok(!JSON.stringify(list).includes('passwordHash'));
  assert.equal((await request('/api/campaigns','POST',auth('platform'),form('draft-only',{playerPassword:''}))).status,200);
  assert.equal((await request('/api/campaign-access','POST',undefined,{campaignId:'draft-only',role:'admin',password:master})).status,400);
});
test('deletion requires platform login, fresh admin password and the current revision',async()=>{
  const body={id:a,revision:2,password:master};
  for(const cookie of [undefined,auth(a),auth(a,'player')])assert.equal((await request('/api/campaigns','DELETE',cookie,body)).status,403);
  for(const password of [undefined,'wrong-password','players-only'])assert.equal((await request('/api/campaigns','DELETE',auth('platform'),{...body,password})).status,401);
  assert.equal((await request('/api/campaigns','DELETE',auth('platform'),{...body,revision:1})).status,409);
  assert.equal((await request('/api/campaigns','DELETE',auth('platform'),body)).status,200);
  assert.ok(!(await(await request('/api/campaigns')).json()).campaigns.some(item=>item.id===a));
  for(const path of ['/api/map-pins','/api/map-state','/api/map-image','/api/pin-images'])assert.equal((await request(`${path}?campaign=${a}`,'GET',auth(a))).status,404);
  assert.equal((await(await request(`/api/campaign-access?campaign=${a}`,'GET',auth(a))).json()).authenticated,false);
  assert.equal((await request(`/api/campaign-assets?id=${coverA.id}`)).status,404);
  assert.equal((await request('/api/campaigns','POST',auth('platform'),form(a))).status,409);
  assert.equal((await request('/api/map-pins?campaign='+b,'GET',auth(b))).status,200);
});
test('deleted seed campaigns do not return when the catalog module is reloaded',async()=>{
  assert.equal((await request('/api/campaigns','DELETE',auth('platform'),{id:'campanha-02',revision:0,password:master})).status,200);
  const {listCampaigns}=await import(`../server/campaign-store.js?fresh=${Date.now()}`);
  assert.ok(!(await listCampaigns()).some(item=>item.id==='campanha-02'));
});
