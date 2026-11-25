import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import sharp from 'sharp';
import pinsHandler from '../api/map-pins.js';
import imageHandler from '../api/map-image.js';
import attachmentsHandler from '../api/pin-images.js';
import {createSession,cookieNameFor} from '../api/campaign-access.js';
import {defaultCampaignId} from '../shared/campaigns.js';

const secret='map-pages-test-secret-with-more-than-32-characters';
const campaign=defaultCampaignId,other='campanha-02';
let directory,server,origin,asset,page,second,mainPin,areaPin,link;
const auth=(role='admin',id=campaign)=>`${cookieNameFor(id)}=${createSession(secret,role,Date.now(),id)}`;
const request=(path,method='GET',body,role='admin',id=campaign,headers={})=>fetch(`${origin}${path}${path.includes('?')?'&':'?'}campaign=${id}`,{method,headers:{...(role?{Cookie:auth(role,id)}:{}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const fixture=()=>({id:randomUUID(),title:'Pin da área',description:'',category:'places',icon:'landmark',shape:'marker',color:'#d6bd8e',x:.4,y:.6});
const vertices=[{x:.2,y:.2},{x:.6,y:.2},{x:.6,y:.6},{x:.2,y:.6}];
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'dioos-map-pages-'));
  process.env.PIN_DATA_FILE=join(directory,'pins.json');process.env.SESSION_SECRET=secret;
  delete process.env.DATABASE_URL;delete process.env.VERCEL;
  server=createServer((req,res)=>req.url.startsWith('/api/map-image')?imageHandler(req,res):req.url.startsWith('/api/pin-images')?attachmentsHandler(req,res):pinsHandler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('dioos-map-pages-'));await rm(directory,{recursive:true,force:true});});

test('campaign map catalog and uploads require campaign admin; players only read',async()=>{
  assert.equal((await request('/api/map-pins?action=pages','GET',undefined,null)).status,401);
  assert.deepEqual(await(await request('/api/map-pins?action=pages','GET',undefined,'player')).json(),{pages:[]});
  for(const action of ['pages','map-upload'])for(const method of ['POST','PATCH','DELETE'])assert.equal((await request(`/api/map-pins?action=${action}`,method,{},'player')).status,403);
  const data=(await sharp({create:{width:800,height:600,channels:3,background:'#28342a'}}).png().toBuffer()).toString('base64');
  assert.equal((await request('/api/map-pins?action=map-upload','POST',{name:'Area.png',data},'admin',campaign,{Origin:'https://elsewhere.example'})).status,403);
  const response=await request('/api/map-pins?action=map-upload','POST',{name:'Area.png',data,campaignId:other,kind:'cover'});
  assert.equal(response.status,201);asset=(await response.json()).asset;
  assert.equal(asset.campaignId,campaign);assert.equal(asset.kind,'map');assert.equal(asset.width,800);
});

test('maps persist with optimistic revisions, validated campaign images and no changes to main pins',async()=>{
  mainPin=(await(await request('/api/map-pins','POST',fixture())).json()).pin;
  const draft={id:randomUUID(),revision:0,title:'Witherbloom',description:'Campus',assetId:asset.id};
  assert.equal((await request('/api/map-pins?action=pages','POST',draft,'admin',other)).status,400);
  for(const bad of [{title:' '},{revision:-1},{assetId:randomUUID()},{description:'x'.repeat(4001)}])assert.equal((await request('/api/map-pins?action=pages','POST',{...draft,...bad})).status,400);
  const created=await request('/api/map-pins?action=pages','POST',draft);assert.equal(created.status,201);page=(await created.json()).page;
  assert.equal((await request('/api/map-pins?action=pages','POST',draft)).status,409);
  assert.equal(page.revision,1);
  const updated=await request('/api/map-pins?action=pages','PATCH',{...draft,revision:1,title:'Campus Witherbloom'});assert.equal(updated.status,200);page=(await updated.json()).page;
  assert.equal((await request('/api/map-pins?action=pages','PATCH',{...draft,revision:1})).status,409);
  const catalog=(await(await request('/api/map-pins?action=pages','GET',undefined,'player')).json()).pages;
  assert.deepEqual(catalog,[page]);assert.deepEqual((await(await request('/api/map-pins')).json()).pins,[mainPin]);
  assert.deepEqual(JSON.parse(await readFile(process.env.PIN_DATA_FILE,'utf8')).mapPages,[page]);
  second=(await(await request('/api/map-pins?action=pages','POST',{...draft,id:randomUUID(),title:'Biblioteca'})).json()).page;
});

test('page pins and territories are isolated from main map and each other, including edit/delete',async()=>{
  areaPin=(await(await request(`/api/map-pins?map=${page.id}`,'POST',fixture())).json()).pin;
  assert.equal(areaPin.mapId,page.id);
  const territory=(await(await request(`/api/map-pins?map=${second.id}`,'POST',{...fixture(),category:'territories',vertices})).json()).pin;
  assert.equal(territory.mapId,second.id);
  assert.deepEqual((await(await request('/api/map-pins','GET',undefined,'player')).json()).pins,[mainPin]);
  assert.deepEqual((await(await request(`/api/map-pins?map=${page.id}`,'GET',undefined,'player')).json()).pins,[areaPin]);
  for(const wrong of ['main',second.id])for(const method of ['PATCH','DELETE'])assert.equal((await request(`/api/map-pins?map=${wrong}`,method,areaPin)).status,409);
  assert.equal((await request(`/api/map-pins?map=${page.id}`,'PATCH',{...areaPin,title:'Editado'},'player')).status,403);
  const edit=await request(`/api/map-pins?map=${page.id}`,'PATCH',{...areaPin,title:'Editado'});assert.equal(edit.status,200);areaPin=(await edit.json()).pin;
  assert.equal((await request('/api/map-pins?map=../../secret')).status,400);
  assert.equal((await request(`/api/map-pins?map=${randomUUID()}`)).status,404);
  assert.equal((await request(`/api/map-pins?map=${page.id}`,'GET',undefined,'admin',other)).status,404);
});

test('clickable map pages validate geometry and destinations, support nested maps and return links',async()=>{
  const draft={...fixture(),category:'map-pages',vertices,targetMapId:page.id};
  for(const bad of [{vertices:undefined},{vertices:vertices.slice(0,2)},{targetMapId:'invalid'},{targetMapId:'main'}])assert.equal((await request('/api/map-pins','POST',{...draft,...bad})).status,400);
  assert.equal((await request('/api/map-pins','POST',{...draft,targetMapId:randomUUID()})).status,404);
  assert.equal((await request('/api/map-pins','POST',draft,'player')).status,403);
  link=(await(await request('/api/map-pins','POST',draft)).json()).pin;
  assert.equal(link.targetMapId,page.id);assert.deepEqual(link.vertices,vertices);
  assert.equal((await request(`/api/map-pins?map=${page.id}`,'POST',{...draft,id:randomUUID()})).status,400);
  for(const target of ['main',second.id])assert.equal((await request(`/api/map-pins?map=${page.id}`,'POST',{...draft,id:randomUUID(),targetMapId:target})).status,201);
  assert.equal((await request('/api/map-pins','DELETE',{id:link.id,revision:link.revision})).status,200);
  assert.equal((await request(`/api/map-pins?map=${page.id}`)).status,200);
  assert.equal((await request('/api/map-pins?action=pages','DELETE',page)).status,405);
});

test('page images and attachments are readable by players but never across campaigns or without login',async()=>{
  const path=`/api/map-image?map=${page.id}`;
  assert.equal((await request(path,'GET',undefined,null)).status,401);
  assert.equal((await request(path,'GET',undefined,'player',other)).status,404);
  const response=await request(path,'GET',undefined,'player');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
  const metadata=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(metadata.width,800);assert.equal(metadata.height,600);
  assert.equal((await request(path,'HEAD',undefined,'player')).status,200);
  assert.equal((await request('/api/map-image?map=invalid')).status,400);
  const data=(await sharp({create:{width:24,height:24,channels:3,background:'#abcdef'}}).png().toBuffer()).toString('base64');
  const image=(await(await request('/api/pin-images','POST',{name:'Retrato',data})).json()).image;
  assert.equal((await request(`/api/pin-images?id=${image.id}`,'GET',undefined,'player')).status,404);
  const update=await request(`/api/map-pins?map=${page.id}`,'PATCH',{...areaPin,images:[image]});assert.equal(update.status,200);areaPin=(await update.json()).pin;
  assert.equal((await request(`/api/pin-images?id=${image.id}`,'GET',undefined,'player')).status,200);
  assert.equal((await request(`/api/pin-images?id=${image.id}`,'GET',undefined,'player',other)).status,404);
  assert.equal((await request(`/api/map-pins?map=${page.id}`,'DELETE',areaPin)).status,200);
  assert.equal((await request(`/api/pin-images?id=${image.id}`,'GET',undefined,'player')).status,404);
});

test('concurrent page creation preserves catalogs, and Vercel never falls back to local writes',async()=>{
  const make=()=>({id:randomUUID(),revision:0,title:'Área',description:'',assetId:asset.id});
  const results=await Promise.all(Array.from({length:4},()=>request('/api/map-pins?action=pages','POST',make())));
  assert.ok(results.every(r=>r.status===201));assert.equal((await(await request('/api/map-pins?action=pages')).json()).pages.length,6);
  process.env.VERCEL='1';
  try{assert.equal((await request('/api/map-pins?action=pages')).status,503);assert.equal((await request('/api/map-pins?action=pages','POST',make())).status,503);}
  finally{delete process.env.VERCEL;}
});
