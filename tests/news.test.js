import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,relative,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import handler from '../api/news.js';
import { createSession } from '../api/campaign-access.js';
import { createFeedSession } from '../server/feed-session.js';
import { createCharacter } from '../server/feed-store.js';
let directory,server,origin,news,character,cover;
const secret='news-test-secret-with-more-than-thirty-two-characters';
const admin=()=>`dioos_platform=${createSession(secret,'admin',Date.now(),'platform')}`;
const asCharacter=()=>`dioos_xweeter=${createFeedSession(character.id,secret)}`;
const request=(query='',method='GET',body,cookie,headers={})=>fetch(`${origin}${query}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const draft=()=>({id:randomUUID(),revision:0,title:'Notícia de teste',summary:'Resumo da campanha',content:'Uma primeira história.\n\nOutro parágrafo.',campaignId:'a-ultima-valsa-dos-imortais'});
before(async()=>{directory=await mkdtemp(join(tmpdir(),'dioos-news-test-'));process.env.PIN_DATA_FILE=join(directory,'pins.json');process.env.NEWS_DATA_FILE=join(directory,'news.json');process.env.FEED_DATA_FILE=join(directory,'feed.json');process.env.SESSION_SECRET=secret;delete process.env.DATABASE_URL;delete process.env.VERCEL;character=await createCharacter({id:randomUUID(),name:'Leitor',password:'test-character',color:'#998877'});cover=(await sharp({create:{width:500,height:300,channels:3,background:'#453f35'}}).png().toBuffer()).toString('base64');server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/api/news`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('dioos-news-test-'));await rm(directory,{recursive:true,force:true});});
test('only platform administrators can publish; campaign and character sessions cannot',async()=>{
  const input={...draft(),image:cover};
  for(const cookie of [undefined,asCharacter(),`dioos_imortais=${createSession(secret,'admin')}`])assert.equal((await request('','POST',input,cookie)).status,403);
  assert.equal((await request('','POST',input,admin(),{Origin:'https://foreign.example'})).status,403);
  const response=await request('','POST',input,admin());assert.equal(response.status,201);news=(await response.json()).news;assert.ok(news.image);assert.equal(news.content,input.content);assert.match(news.campaignName,/Última Valsa/);
  const listing=await(await request()).json();assert.equal(listing.news.length,1);assert.equal(listing.news[0].content,undefined);assert.equal(listing.news[0].cover,undefined);
  assert.equal((await(await request(`?id=${news.id}`)).json()).news.title,input.title);
  const image=await request(`?action=cover&id=${news.id}`);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');
});
test('edits require current revision, preserve covers and support explicit cover removal',async()=>{
  const input={...draft(),id:news.id,revision:news.revision,title:'Título editado'};
  assert.equal((await request('','PATCH',input,asCharacter())).status,403);
  const result=await request('','PATCH',input,admin());assert.equal(result.status,200);news=(await result.json()).news;assert.equal(news.revision,2);assert.ok(news.image);
  assert.equal((await request('','PATCH',input,admin())).status,409);
  const removed=await request('','PATCH',{...input,revision:2,removeCover:true},admin());assert.equal(removed.status,200);news=(await removed.json()).news;assert.equal(news.image,null);assert.equal((await request(`?action=cover&id=${news.id}`)).status,404);
});
test('news validates body and campaigns; published text is returned as text without HTML interpretation',async()=>{
  for(const input of [{...draft(),title:''},{...draft(),content:' '},{...draft(),summary:'x'.repeat(321)},{...draft(),campaignId:'missing'},{...draft(),image:Buffer.from('<svg/>').toString('base64')},{...draft(),revision:9}])assert.equal((await request('','POST',input,admin())).status,400);
  const input={...draft(),content:'<script>literal text</script> 🌙'};const response=await request('','POST',input,admin());assert.equal(response.status,201);assert.equal((await response.json()).news.content,input.content);
});
test('comments use the Xweeter identity, reject impersonation and require a valid character session',async()=>{
  const body={id:randomUUID(),newsId:news.id,text:'Uma voz do Xweeter. 🌙'};
  for(const cookie of [undefined,admin()])assert.equal((await request('?action=comment','POST',body,cookie)).status,401);
  for(const invalid of [{...body,text:'x'.repeat(1001)},{...body,text:' '},{...body,characterId:randomUUID()},{...body,image:cover}])assert.equal((await request('?action=comment','POST',invalid,asCharacter())).status,400);
  assert.equal((await request('?action=comment','POST',{...body,newsId:randomUUID()},asCharacter())).status,404);
  const response=await request('?action=comment','POST',body,asCharacter());assert.equal(response.status,201);const comment=(await response.json()).comment;assert.equal(comment.characterId,character.id);
  assert.equal((await(await request('?action=comment','POST',body,asCharacter())).json()).comment.id,comment.id);
  assert.equal((await request('?action=comment','POST',{...body,id:randomUUID()},asCharacter())).status,429);
  const listing=await(await request(`?action=comments&id=${news.id}`,'GET',undefined,asCharacter())).json();assert.equal(listing.characterId,character.id);assert.equal(listing.admin,false);assert.equal(listing.comments.length,1);assert.ok(!JSON.stringify(listing).includes('password'));
  assert.equal((await request('?action=comment','DELETE',{id:comment.id},asCharacter())).status,403);
});
test('deleting news requires revision and physically deletes the article, cover and associated comments',async()=>{
  assert.equal((await request('','DELETE',{id:news.id,revision:1},admin())).status,409);
  assert.equal((await request('','DELETE',{id:news.id,revision:news.revision},asCharacter())).status,403);
  assert.equal((await request('','DELETE',{id:news.id,revision:news.revision},admin())).status,200);
  assert.equal((await request(`?id=${news.id}`)).status,404);assert.equal((await request(`?action=comments&id=${news.id}`)).status,404);
  const stored=JSON.parse(await readFile(process.env.NEWS_DATA_FILE));assert.ok(!stored.news.some(item=>item.id===news.id));assert.ok(!stored.comments.some(item=>item.newsId===news.id));
});
test('pagination is bounded and has no duplicate articles; malformed cursor is rejected',async()=>{
  for(let i=0;i<13;i++)assert.equal((await request('','POST',{...draft(),title:`Crônica ${i}`},admin())).status,201);
  const first=await(await request()).json();assert.equal(first.news.length,12);assert.ok(first.nextCursor);
  const next=await(await request(`?before=${encodeURIComponent(first.nextCursor)}`)).json();assert.equal(next.news.length,2);assert.equal(next.nextCursor,null);assert.equal(new Set([...first.news,...next.news].map(item=>item.id)).size,14);
  assert.equal((await(await request('?limit=3')).json()).news.length,3);assert.equal((await request('?before=invalid')).status,400);
});
