import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,relative,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import handler from '../api/map-pins.js';
import { createSession } from '../api/campaign-access.js';
import { validatePin } from '../server/pin-validation.js';
import { validateTerritory,territoryCenter,MAX_TERRITORY_POINTS } from '../shared/territories.js';
import { customSymbols } from '../shared/custom-symbols.js';
const vertices=[{x:.2,y:.2},{x:.6,y:.2},{x:.6,y:.6},{x:.2,y:.6}];
const body=()=>({id:randomUUID(),title:'Território de teste',description:'Contorno da região',category:'territories',icon:'custom-bar',color:'#7fabc0',shape:'marker',x:.1,y:.1,vertices});
const secret='territory-test-secret-with-more-than-32-characters';
const cookie=role=>`dioos_imortais=${createSession(secret,role)}`;
let directory,server,origin;
const request=(method,role,data)=>fetch(origin,{method,headers:{Cookie:cookie(role),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
before(async()=>{directory=await mkdtemp(join(tmpdir(),'dioos-territory-test-'));process.env.PIN_DATA_FILE=join(directory,'pins.json');process.env.SESSION_SECRET=secret;delete process.env.DATABASE_URL;delete process.env.VERCEL;server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/api/map-pins`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('dioos-territory-test-'));await rm(directory,{recursive:true,force:true});});
test('closed territories support concave outlines, either winding, edges and normalized positions',()=>{
  for(const points of [vertices,[...vertices].reverse(),[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:.4,y:.4},{x:0,y:1}]])assert.deepEqual(validateTerritory(points),points);
  assert.ok(Math.abs(territoryCenter(vertices).x-.4)<1e-10);assert.ok(Math.abs(territoryCenter(vertices).y-.4)<1e-10);
  const validated=validatePin(body());assert.deepEqual(validated.vertices,vertices);assert.ok(Math.abs(validated.x-.4)<1e-10);
});
test('server rejects open/degenerate, repeated, crossed and out-of-map outlines',()=>{
  for(const invalid of [[],vertices.slice(0,2),[...vertices,vertices[0]],Array(MAX_TERRITORY_POINTS+1).fill(vertices[0]),[{x:0,y:0},{x:.5,y:.5},{x:1,y:1}],[vertices[0],vertices[2],vertices[1],vertices[3]],[{x:-.1,y:0},...vertices],[{x:NaN,y:0},...vertices],[{x:Infinity,y:0},...vertices]])assert.throws(()=>validateTerritory(invalid));
  assert.throws(()=>validatePin({...body(),category:'places'}),/Somente territórios/);
});
test('administrator saves, edits and deletes territory geometry; players only read',async()=>{
  const input=body();assert.equal((await request('POST','player',input)).status,403);
  const savedResponse=await request('POST','admin',input);assert.equal(savedResponse.status,201);const saved=(await savedResponse.json()).pin;
  const playerList=await(await request('GET','player')).json();assert.deepEqual(playerList.pins[0].vertices,vertices);assert.equal(playerList.pins[0].icon,'custom-bar');
  const revised={...saved,vertices:[{x:.1,y:.1},{x:.8,y:.1},{x:.4,y:.8}],title:'Contorno redesenhado'};
  assert.equal((await request('PATCH','player',revised)).status,403);
  const update=await request('PATCH','admin',revised);assert.equal(update.status,200);const next=(await update.json()).pin;assert.deepEqual(next.vertices,revised.vertices);
  assert.equal((await request('PATCH','admin',revised)).status,409);
  assert.equal((await request('DELETE','player',{id:next.id,revision:next.revision})).status,403);
  assert.equal((await request('DELETE','admin',{id:next.id,revision:next.revision})).status,200);
  assert.equal((await(await request('GET','player')).json()).pins.length,0);
});
test('point pins and old territory pins remain compatible; malformed polygons do not persist',async()=>{
  const point={...body(),category:'places',vertices:undefined,icon:'landmark'};assert.equal((await request('POST','admin',point)).status,201);
  assert.equal((await request('POST','admin',{...body(),vertices:undefined})).status,201);
  assert.equal((await request('POST','admin',{...body(),vertices:vertices.slice(0,2)})).status,400);
  const {pins}=await(await request('GET','player')).json();assert.equal(pins.length,2);assert.ok(pins.every(pin=>!pin.vertices));
});
test('all 36 supplied symbols have compact previews, preserved originals and validated IDs',async()=>{
  assert.equal(customSymbols.length,36);assert.equal(new Set(customSymbols.map(symbol=>symbol.id)).size,36);
  for(const symbol of customSymbols){assert.equal(validatePin({...body(),icon:symbol.id}).icon,symbol.id);const metadata=await sharp(await readFile(`public${symbol.src}`)).metadata();assert.equal(metadata.width,128);assert.equal(metadata.hasAlpha,true);const original=await sharp(await readFile(`public${symbol.src.replace('/pin-symbols/','/pin-symbols/originals/')}`)).metadata();assert.equal(original.width,2000);}
  assert.throws(()=>validatePin({...body(),icon:'custom-../../secret'}));
});
