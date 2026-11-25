import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,relative,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import handler from '../api/feed.js';
import { createSession } from '../api/campaign-access.js';
import { createFeedSession, readFeedSession } from '../server/feed-session.js';
import { postLifetime, createPost, listPosts, purgeExpired } from '../server/feed-store.js';
let dir,server,origin,avatar,cookie,character;
const secret='xweeter-test-secret-longer-than-thirty-two-characters';
const admin=()=>`dioos_platform=${createSession(secret,'admin',Date.now(),'platform')}`;
const req=(query='',method='GET',body,auth,headers={})=>fetch(`${origin}/api/feed${query}`,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:auth}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
before(async()=>{
  dir=await mkdtemp(join(tmpdir(),'dioos-feed-test-'));process.env.PIN_DATA_FILE=join(dir,'pins.json');process.env.FEED_DATA_FILE=join(dir,'xweeter.json');process.env.SESSION_SECRET=secret;process.env.CAMPAIGN_IMORTAIS_ADMIN_PASSWORD='master-test-only';process.env.CRON_SECRET='test-cron-secret';delete process.env.DATABASE_URL;delete process.env.VERCEL;
  avatar=(await sharp({create:{width:300,height:200,channels:3,background:'#81715b'}}).png().toBuffer()).toString('base64');
  server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));assert.ok(relative(resolve(tmpdir()),resolve(dir)).startsWith('dioos-feed-test-'));await rm(dir,{recursive:true,force:true});});
test('only platform administrators create characters and public results never expose password hashes',async()=>{
  const body={id:randomUUID(),name:'A voz do teste',color:'#827359',password:'character-only',image:avatar};
  for(const auth of [undefined,`dioos_imortais=${createSession(secret,'admin')}`])assert.equal((await req('?action=character','POST',body,auth)).status,403);
  assert.equal((await req('?action=character','POST',body,admin(),{Origin:'https://foreign.example'})).status,403);
  assert.equal((await req('?action=character','POST',{...body,password:'master-test-only'},admin())).status,400);
  const response=await req('?action=character','POST',body,admin());assert.equal(response.status,201);character=(await response.json()).character;
  assert.equal(character.name,body.name);assert.ok(character.avatar);assert.equal(character.password_hash,undefined);
  const publicData=await(await req()).json();assert.equal(publicData.characters.length,1);assert.ok(!JSON.stringify(publicData).includes(body.password));assert.ok(!JSON.stringify(publicData).includes('password_hash'));
  const imageResponse=await fetch(`${origin}${character.avatar}`);assert.equal(imageResponse.headers.get('content-type'),'image/webp');assert.equal((await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata()).width,256);
});
test('each character requires its own password and receives an isolated signed session',async()=>{
  assert.equal((await req('?action=session','POST',{characterId:character.id,password:'master-test-only'})).status,401);
  const response=await req('?action=session','POST',{characterId:character.id,password:'character-only'});assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await(await req('', 'GET',undefined,cookie)).json()).characterId,character.id);
  assert.equal(readFeedSession({headers:{cookie:`dioos_xweeter=${createSession(secret,'admin')}`}}),null);
  assert.equal(readFeedSession({headers:{cookie:`dioos_xweeter=${createFeedSession(character.id,secret,0)}`}}),null);
  assert.equal(readFeedSession({headers:{cookie:`${cookie}tampered`}}),null);
});
test('posting is authenticated, text only, bounded and cannot impersonate another character',async()=>{
  const body={id:randomUUID(),text:'Uma história 🌙\n<script>texto, nunca HTML executável</script>'};
  assert.equal((await req('?action=post','POST',body,admin())).status,401);
  for(const invalid of [{...body,text:' '},{...body,text:'x'.repeat(501)},{...body,image:avatar},{...body,characterId:randomUUID()}])assert.equal((await req('?action=post','POST',invalid,cookie)).status,400);
  const response=await req('?action=post','POST',body,cookie);assert.equal(response.status,201);const post=(await response.json()).post;
  assert.equal(post.characterId,character.id);assert.equal(post.text,body.text);assert.equal(Date.parse(post.expiresAt)-Date.parse(post.createdAt),postLifetime);
  assert.equal((await(await req('?action=post','POST',body,cookie)).json()).post.id,post.id);
  assert.equal((await req('?action=post','POST',{id:randomUUID(),text:'Rápido demais'},cookie)).status,429);
});
test('the character lock accepts only one concurrent post and pagination has no duplicates',async()=>{
  const now=Date.now()+11000;
  const results=await Promise.allSettled([createPost(character.id,{id:randomUUID(),text:'A'},now),createPost(character.id,{id:randomUUID(),text:'B'},now)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  for(let i=0;i<32;i++)await createPost(character.id,{id:randomUUID(),text:`Mensagem ${i}`},now+(i+1)*11000);
  const first=await listPosts();assert.equal(first.posts.length,30);assert.ok(first.nextCursor);
  const next=await listPosts(first.nextCursor);assert.equal(next.posts.length,4);assert.equal(next.nextCursor,null);assert.equal(new Set([...first.posts,...next.posts].map(post=>post.id)).size,34);
});

test('only platform admins edit characters; blank password and omitted image preserve existing values and posts',async()=>{
  const body={id:character.id,name:'A voz renovada',color:'#998877',password:''};
  for(const auth of [undefined,cookie,`dioos_imortais=${createSession(secret,'admin')}`])assert.equal((await req('?action=character','PATCH',body,auth)).status,403);
  assert.equal((await req('?action=character','PATCH',body,admin(),{Origin:'https://foreign.example'})).status,403);
  const before=JSON.parse(await readFile(process.env.FEED_DATA_FILE));
  const response=await req('?action=character','PATCH',body,admin());assert.equal(response.status,200);
  const updated=(await response.json()).character;assert.equal(updated.id,character.id);assert.equal(updated.name,body.name);assert.equal(updated.color,body.color);assert.equal(updated.avatar,character.avatar);assert.equal(updated.password_hash,undefined);
  const after=JSON.parse(await readFile(process.env.FEED_DATA_FILE));assert.equal(after.characters[0].password_hash,before.characters[0].password_hash);assert.equal(after.characters[0].avatar,before.characters[0].avatar);assert.deepEqual(after.posts,before.posts);assert.equal(after.characters[0].lastPostAt,before.characters[0].lastPostAt);
  assert.equal((await req('?action=session','POST',{characterId:character.id,password:'character-only'})).status,200);
});

test('editing replaces credentials and avatar, refreshes avatar URLs and supports removing a portrait',async()=>{
  const image=(await sharp({create:{width:100,height:100,channels:3,background:'#123456'}}).png().toBuffer()).toString('base64');
  const body={id:character.id,name:'A voz renovada',color:'#998877',password:'updated-secret',image};
  const response=await req('?action=character','PATCH',body,admin());assert.equal(response.status,200);
  const updated=(await response.json()).character;assert.notEqual(updated.avatar,character.avatar);
  const stored=JSON.parse(await readFile(process.env.FEED_DATA_FILE));
  const actual=Buffer.from(await(await fetch(`${origin}${updated.avatar}`)).arrayBuffer());assert.deepEqual(actual,Buffer.from(stored.characters[0].avatar,'base64'));
  assert.equal((await req('?action=session','POST',{characterId:character.id,password:'character-only'})).status,401);
  assert.equal((await req('?action=session','POST',{characterId:character.id,password:'updated-secret'})).status,200);
  const publicData=await(await req()).json();assert.equal(publicData.characters[0].avatar,updated.avatar);assert.ok(!JSON.stringify(publicData).includes('updated-secret'));
  const removed=await req('?action=character','PATCH',{...body,password:'',image:''},admin());assert.equal(removed.status,200);assert.equal((await removed.json()).character.avatar,null);
  assert.equal((await fetch(`${origin}${updated.avatar}`)).status,404);
});

test('invalid character edits do not change existing data or create a new character',async()=>{
  const body={id:character.id,name:'A voz renovada',color:'#998877',password:''};
  const before=await readFile(process.env.FEED_DATA_FILE,'utf8');
  for(const invalid of [{name:''},{color:'bad'},{password:'abc'},{password:'master-test-only'},{image:'broken-image'},{image:null}])assert.equal((await req('?action=character','PATCH',{...body,...invalid},admin())).status,400);
  assert.equal((await req('?action=character','PATCH',{...body,id:randomUUID()},admin())).status,404);
  assert.equal(await readFile(process.env.FEED_DATA_FILE,'utf8'),before);
});
test('expired posts are physically purged by reads and the authenticated daily cleanup',async()=>{
  const path=process.env.FEED_DATA_FILE,store=JSON.parse(await readFile(path));
  store.posts[0].expiresAt=new Date(Date.now()-1).toISOString();const expiredId=store.posts[0].id;await writeFile(path,JSON.stringify(store));
  assert.ok(!(await(await req()).json()).posts.some(post=>post.id===expiredId));assert.ok(!JSON.parse(await readFile(path)).posts.some(post=>post.id===expiredId));
  assert.equal((await req('?action=cleanup')).status,401);
  assert.equal((await req('?action=cleanup','GET',undefined,undefined,{Authorization:'Bearer test-cron-secret'})).status,200);
  assert.equal(await purgeExpired(Date.now()+postLifetime+1000000),33);assert.equal(JSON.parse(await readFile(path)).posts.length,0);assert.equal(JSON.parse(await readFile(path)).characters.length,1);
});
test('logout clears the character cookie and invalid actions are rejected',async()=>{
  const response=await req('?action=session','DELETE',undefined,cookie);assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await req('?action=nope')).status,400);assert.equal((await req('?action=post','PATCH',{},cookie)).status,405);
});
