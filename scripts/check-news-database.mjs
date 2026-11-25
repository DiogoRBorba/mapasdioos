// Explicit Neon integration check. Cleanup is restricted to generated test IDs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { database } from '../server/pin-store.js';
import { createCharacter } from '../server/feed-store.js';
import { saveNews, getNews, listNews, deleteNews, addComment, listComments, deleteComment } from '../server/news-store.js';

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const id=randomUUID(), characterId=randomUUID(), commentId=randomUUID();
try {
  await createCharacter({id:characterId,name:'Verificação temporária do blog',color:'#856942',password:randomUUID()});
  const image=(await sharp({create:{width:8,height:8,channels:3,background:'#856942'}}).png().toBuffer()).toString('base64');
  const draft={id,revision:0,title:'Verificação temporária do blog',summary:'Registro de teste removido ao concluir.',content:'Verificação isolada de persistência.',image};
  const first=await saveNews(draft,true);
  assert.equal(first.revision,1);assert.ok(first.image);
  assert.ok((await getNews(id,true)).cover);
  assert.ok((await listNews()).news.some(item=>item.id===id));
  const edited=await saveNews({...draft,revision:1,image:undefined,title:'Verificação revisada'},false);
  assert.equal(edited.revision,2);assert.ok((await getNews(id,true)).cover);
  await assert.rejects(saveNews({...draft,revision:1,image:undefined},false),{status:409});
  const input={id:commentId,newsId:id,text:'Comentário de verificação 🕯️'};
  assert.equal((await addComment(characterId,input)).characterId,characterId);
  assert.equal((await addComment(characterId,input)).id,commentId);
  await assert.rejects(addComment(characterId,{...input,id:randomUUID()}),{status:429});
  assert.equal((await listComments(id)).comments.length,1);
  await deleteComment(commentId);assert.equal((await listComments(id)).comments.length,0);
  const db=await database();await db`UPDATE dioos_xweeters SET last_post_at=NULL WHERE id=${characterId}`;
  await addComment(characterId,{...input,id:randomUUID()});
  await deleteNews(id,2);assert.equal(await getNews(id),null);
  assert.equal((await db`SELECT id FROM dioos_news_comments WHERE news_id=${id}`).length,0);
  console.log('Neon: notícias, capas, edição concorrente, comentários, moderação e exclusão em cascata verificados.');
} finally {
  const db=await database();
  await db`DELETE FROM dioos_news_comments WHERE news_id=${id}`;
  await db`DELETE FROM dioos_news WHERE id=${id}`;
  await db`DELETE FROM dioos_xweeters WHERE id=${characterId}`;
  console.log('Somente registros gerados por esta verificação foram removidos.');
}
