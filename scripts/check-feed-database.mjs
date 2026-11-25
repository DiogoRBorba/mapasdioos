// Run explicitly against the configured Neon database. Only generated test IDs are removed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from '../server/pin-store.js';
import { createCharacter, getCharacter, createPost, listPosts, listCharacters, purgeExpired } from '../server/feed-store.js';
import { saveCampaign, deleteCampaign, listCampaigns } from '../server/campaign-store.js';

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const characterId=randomUUID(),postId=randomUUID(),campaignId=`qa-${randomUUID()}`;
let db;
try {
  const character=await createCharacter({id:characterId,name:'Verificação temporária do Xweeter',color:'#856942',password:randomUUID()});
  assert.equal(character.id,characterId);
  const stored=await getCharacter(characterId);assert.ok(stored.password_hash);assert.equal(stored.name,character.name);
  const text='Verificação isolada de persistência. Este registro será removido ao final do teste.';
  const post=await createPost(characterId,{id:postId,text});assert.equal(post.characterId,characterId);assert.equal(Date.parse(post.expiresAt)-Date.parse(post.createdAt),72*3600000);
  const duplicate=await createPost(characterId,{id:postId,text});assert.equal(duplicate.id,postId);
  await assert.rejects(createPost(characterId,{id:randomUUID(),text:'limite'}),{status:429});
  assert.ok((await listCharacters()).some(item=>item.id===characterId));assert.ok((await listPosts()).posts.some(item=>item.id===postId));
  db=await database();await db`UPDATE dioos_xweets SET expires_at=now()-interval '1 second' WHERE id=${postId} AND character_id=${characterId}`;
  await purgeExpired();assert.equal((await db`SELECT id FROM dioos_xweets WHERE id=${postId}`).length,0);
  const campaign=await saveCampaign({id:campaignId,revision:0,title:'Campanha de verificação temporária',subtitle:'',description:'',playerPassword:''},{});
  await deleteCampaign(campaignId,campaign.revision);assert.ok(!(await listCampaigns()).some(item=>item.id===campaignId));
  console.log('Neon: criação, persistência, expiração, exclusão e limite de postagens verificados.');
} finally {
  db ||= await database();
  await db`DELETE FROM dioos_xweets WHERE character_id=${characterId}`;
  await db`DELETE FROM dioos_xweeters WHERE id=${characterId}`;
  await db`DELETE FROM dioos_campaigns WHERE id=${campaignId}`;
  console.log('Somente os registros temporários desta verificação foram removidos.');
}
