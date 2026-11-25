import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ImagePlus, LoaderCircle, Map as MapIcon, Pencil, Plus, X } from 'lucide-react';
import { campaignApi } from '../CampaignContext';
import { imagePayload } from '../upload';
import type { MapPageRecord } from './types';

export default function MapPagesManager({campaignId,pages,onSaved,onClose,onExpired}:{campaignId:string;pages:MapPageRecord[];onSaved:(page:MapPageRecord)=>void;onClose:()=>void;onExpired:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const pending=useRef(false);
  const [draft,setDraft]=useState<MapPageRecord|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [replacement,setReplacement]=useState(false),[confirmed,setConfirmed]=useState(false);
  useEffect(()=>{const opener=document.activeElement as HTMLElement;dialog.current?.showModal();return()=>opener?.focus();},[]);
  const close=()=>{if(!pending.current)onClose();};
  function edit(page?:MapPageRecord){setDraft(page||{id:crypto.randomUUID(),title:'',description:'',revision:0,image:{id:'',name:'',width:0,height:0}});setError('');setReplacement(false);setConfirmed(false);}
  async function request(action:string,method:string,body:unknown){
    const response=await fetch(campaignApi(`/api/map-pins?action=${action}`,campaignId),{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(response.status===401){onExpired();throw new Error('Seu acesso expirou.');}
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar.');return data;
  }
  async function upload(file?:File){
    if(!file||!draft||pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{const data=await imagePayload(file);const result=await request('map-upload','POST',{name:file.name.slice(0,240),data});setDraft({...draft,image:result.asset});setReplacement(draft.revision>0);setConfirmed(false);}
    catch(err){setError(err instanceof Error?err.message:'Não foi possível enviar a imagem.');}
    finally{pending.current=false;setBusy(false);}
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(!draft||pending.current||!draft.image.id||(replacement&&!confirmed))return;
    pending.current=true;setBusy(true);setError('');
    try{const {page}=await request('pages',draft.revision?'PATCH':'POST',{id:draft.id,title:draft.title,description:draft.description,revision:draft.revision,assetId:draft.image.id});onSaved(page);setDraft(null);setNotice('Mapa salvo. Agora desenhe uma Página de mapa e escolha este destino.');}
    catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="access-dialog map-pages-dialog" aria-labelledby="map-pages-title" onCancel={event=>{event.preventDefault();close();}}>
    <button className="icon-button dialog-close" onClick={close} disabled={busy} aria-label="Fechar mapas da campanha"><X size={20}/></button>
    <p className="eyebrow">ADMINISTRAÇÃO DO ATLAS</p><h2 id="map-pages-title">{draft?'Um novo horizonte.':'Mapas da campanha.'}</h2>
    {draft?<form onSubmit={save}>
      <button type="button" className="text-link" disabled={busy} onClick={()=>{setDraft(null);setError('');}}><ArrowLeft size={14}/> Voltar à lista</button>
      <fieldset disabled={busy}>
        <label htmlFor="page-name">Nome do mapa</label><input id="page-name" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} maxLength={120} placeholder="Ex.: Campus Witherbloom" required autoFocus/>
        <label htmlFor="page-description">Descrição <small>opcional</small></label><textarea id="page-description" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} maxLength={4000} rows={3}/>
        <label className="page-image-upload"><ImagePlus size={22}/><strong>{draft.image.id?draft.image.name:'Enviar imagem do mapa'}</strong><span>JPG, PNG ou WebP · até 20 MB</span><input type="file" aria-label="Imagem do mapa da área" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
        {draft.image.id&&<p className="editor-footnote">{draft.image.width} × {draft.image.height} pixels · imagem preparada</p>}
        {replacement&&<label className="page-replace-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Entendo que os pins manterão suas posições relativas na nova imagem.</label>}
      </fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy||!draft.title.trim()||!draft.image.id||(replacement&&!confirmed)}>{busy?<><LoaderCircle className="spin" size={16}/> Preparando…</>:<><Check size={16}/> Salvar mapa</>}</button>
    </form>:<>
      <p className="map-pages-intro">Cadastre os mapas das áreas. Depois, conecte-os desenhando uma Página de mapa no mapa de origem.</p>
      <button className="button primary full" onClick={()=>edit()}><Plus size={16}/> Adicionar mapa</button>
      {notice&&<p className="map-pages-notice" role="status">{notice}</p>}
      <ul className="map-pages-list"><li><MapIcon size={20}/><span><strong>Mapa principal</strong><small>Mantido nas configurações da campanha</small></span></li>{pages.map(page=><li key={page.id}><MapIcon size={20}/><span><strong>{page.title}</strong><small>{page.image.width} × {page.image.height}</small></span><button className="icon-button" onClick={()=>edit(page)} aria-label={`Editar mapa ${page.title}`}><Pencil size={16}/></button></li>)}</ul>
      {!pages.length&&<p className="editor-footnote">Nenhum mapa de área cadastrado ainda.</p>}
      <button className="button secondary full" onClick={close}>Voltar ao mapa</button>
    </>}
  </dialog>;
}
