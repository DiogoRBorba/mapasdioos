// Run with DATABASE_URL supplied securely through the environment. Never logs credentials.
// Existing remote records are preserved; repeat runs do not reset live edits.
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {database,getHuntState,listPins} from '../server/pin-store.js';
import {listCampaigns} from '../server/campaign-store.js';
import {getPinImage} from '../server/pin-images.js';
import {getAsset} from '../server/campaign-assets.js';
import {inCampaign} from '../server/campaign-scope.js';
import {defaultCampaignId,seedCampaigns} from '../shared/campaigns.js';
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
const files=async path=>{try{return await readdir(path);}catch(error){if(error.code==='ENOENT')return [];throw error;}};
if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL antes da migração.');
try{
  const db=await database();await listCampaigns();await getAsset('00000000-0000-4000-8000-000000000000');
  const campaigns=await read('.data/campaigns.json',seedCampaigns);
  for(const campaign of campaigns){
    await db`INSERT INTO dioos_campaigns(id,data,revision) VALUES(${campaign.id},${JSON.stringify(campaign)}::jsonb,${campaign.revision}) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,revision=EXCLUDED.revision WHERE dioos_campaigns.revision=0`;
    await inCampaign(campaign.id,async()=>{
      await getHuntState();await getPinImage('00000000-0000-4000-8000-000000000000');
      const filename=campaign.id===defaultCampaignId?'imortais-pins.json':`campaign-${campaign.id}.json`;
      const local=await read(join('.data',filename),null);
      if(local){
        for(const pin of local.pins){
          const {id,revision,createdAt,updatedAt,deleted,...data}=pin;
          await db`INSERT INTO dioos_map_pins(id,campaign_id,data,revision,deleted,created_at,updated_at) VALUES(${id},${campaign.id},${JSON.stringify(data)}::jsonb,${revision},${!!deleted},${createdAt},${updatedAt}) ON CONFLICT(id) DO NOTHING`;
        }
        if(local.huntState){const state=local.huntState;await db`UPDATE dioos_hunt_state SET day=${state.day},period=${state.period},revision=${state.revision},updated_at=${state.updatedAt} WHERE campaign_id=${campaign.id} AND revision=0`;}
      }
      const imageDir=join('.data',campaign.id===defaultCampaignId?'pin-images':`pin-images-${campaign.id}`);
      for(const file of await files(imageDir)){if(!file.endsWith('.json'))continue;const image=await read(join(imageDir,file));await db`INSERT INTO dioos_pin_images(id,campaign_id,metadata,data) VALUES(${image.metadata.id},${campaign.id},${JSON.stringify(image.metadata)}::jsonb,${image.data}) ON CONFLICT(id) DO NOTHING`;}
    });
  }
  for(const file of await files('.data/campaign-assets')){if(!file.endsWith('.json'))continue;const asset=await read(join('.data/campaign-assets',file));await db`INSERT INTO dioos_campaign_assets(id,metadata,data) VALUES(${asset.metadata.id},${JSON.stringify(asset.metadata)}::jsonb,${asset.data}) ON CONFLICT(id) DO NOTHING`;}
  const summary=await inCampaign(defaultCampaignId,async()=>({campaigns:(await listCampaigns()).length,activePins:(await listPins()).length,hunt:await getHuntState()}));
  console.log(JSON.stringify({migrated:true,...summary}));
}catch(error){console.error('Migração não concluída. Nenhuma credencial foi exibida.',error.code||error.name);process.exitCode=1;}
