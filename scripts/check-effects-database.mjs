import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,getHuntState,publishHuntState} from '../server/pin-store.js';
import {inCampaign} from '../server/campaign-scope.js';
import {defaultEffects,defaultHeader} from '../shared/effects.js';
assert.ok(process.env.DATABASE_URL,'DATABASE_URL is required');
const id=`qa-effects-${randomUUID()}`,other=`qa-effects-${randomUUID()}`;
try{
  await inCampaign(id,async()=>{
    const initial=await getHuntState();assert.deepEqual(initial.effects,defaultEffects);assert.deepEqual(initial.header,defaultHeader);
    const effects={...defaultEffects,fog:false,torchlight:true,intensity:75},header={label:'Calendário de teste',dayLabel:'Jornada',dateText:'12 de Ches, 1492'};
    const next=await publishHuntState({revision:0,effects,header});assert.deepEqual(next.effects,effects);assert.deepEqual(next.header,header);assert.equal(next.day,1);
    const time=await publishHuntState({revision:1,day:9,period:'night'});assert.deepEqual(time.effects,effects);assert.deepEqual(time.header,header);
    await assert.rejects(publishHuntState({revision:1,effects:defaultEffects}),{status:409});
    const saved=await getHuntState();assert.equal(saved.day,9);assert.equal(saved.period,'night');assert.equal(saved.revision,2);
  });
  await inCampaign(other,async()=>{const state=await getHuntState();assert.deepEqual(state.effects,defaultEffects);assert.deepEqual(state.header,defaultHeader);assert.equal(state.day,1);});
  console.log('Neon: migração compatível, efeitos, cabeçalho, preservação de período, concorrência e isolamento verificados.');
}finally{
  const db=await database();await db`DELETE FROM dioos_hunt_state WHERE campaign_id IN (${id},${other})`;
  console.log('Somente os dois estados temporários gerados por esta verificação foram removidos.');
}
