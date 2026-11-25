import type { Xweeter } from '../XweeterFeed';
export type SocialCharacter={id:string;revision:number;points?:number;name:string;tag:string;bio:string;kind:'player'|'npc';xweeterId:string|null;portraitId:string|null};
export type Question={id:string;prompt:string;type:'text'|'choice';required:boolean;options:string[]};
export type TaskStep={id:string;description:string;done:boolean};
export type Task={id:string;revision:number;title:string;description:string;due:string;kind:'activity'|'quest'|'exam';status:'draft'|'published'|'closed'|'completed'|'failed';steps?:TaskStep[];questions:Question[]};
export type Submission={taskId:string;characterId:string;title:string;taskRevision:number;submittedAt:string;answers:{questionId:string;prompt:string;answer:string}[]};
export type PrivateNote={characterId:string;targetId:string;text:string;revision:number;updatedAt:string};
export type SocialData={characters:SocialCharacter[];tasks:Task[];notes?:PrivateNote[];relations:{characterId:string;npcId:string;value:number}[];progress:{characterId:string;taskId:string;done:boolean}[];submissions:Submission[];viewerId:string|null;xweeters?:Xweeter[]};
export const taskNames={activity:'Atividade',quest:'Quest',exam:'Prova'};
export const statusNames={draft:'Rascunho',published:'Em aberto',closed:'Encerrada',completed:'Completada',failed:'Fracassada'};
export function socialUrl(campaign:string,action?:string,id?:string){return `/api/social?campaign=${encodeURIComponent(campaign)}${action?`&action=${action}`:''}${id?`&id=${id}`:''}`;}
export async function socialRequest(campaign:string,action?:string,body?:unknown,method=body===undefined?'GET':'POST'){
  const response=await fetch(socialUrl(campaign,action),{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível salvar.'),{status:response.status});return data;
}
