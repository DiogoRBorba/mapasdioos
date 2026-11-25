export type NewsItem={id:string;title:string;summary:string;content?:string;campaignId:string|null;campaignName:string;image:string|null;revision:number;createdAt:string;updatedAt:string};
export async function newsRequest(query='',method='GET',body?:unknown,signal?:AbortSignal){
  const response=await fetch(`/api/news${query}`,{method,signal,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível acessar as notícias.'),{status:response.status});return data;
}
export const newsDate=(value:string)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(value));
