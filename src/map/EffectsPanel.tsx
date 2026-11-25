import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Sparkles, X } from 'lucide-react';
import { defaultEffects, effectOptions } from '../../shared/effects.js';
import type { Effects, HuntState, MapStatePatch } from './useHuntState';
import './effects.css';

export default function EffectsPanel({state,publishing,onPreview,onClose,onPublish}:{state:HuntState;publishing:boolean;onPreview:(effects:Effects|null)=>void;onClose:()=>void;onPublish:(patch:MapStatePatch)=>Promise<boolean>}){
  const [draft,setDraft]=useState<Effects>({...state.effects});
  const [revision]=useState(state.revision);
  const [preview,setPreview]=useState(true);
  const [error,setError]=useState('');
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{onPreview(preview?draft:null);return()=>onPreview(null);},[draft,preview,onPreview]);
  const groups=[...new Set(effectOptions.map(option=>option.group))];
  const count=effectOptions.filter(option=>draft[option.id as keyof Effects]).length;
  async function submit(event:React.FormEvent){
    event.preventDefault();if(publishing)return;setError('');
    try{if(await onPublish({revision,effects:draft}))onClose();}
    catch(err){setError(err instanceof Error&&!(err instanceof TypeError)?err.message:'Não foi possível salvar os efeitos. Tente novamente.');}
  }
  return <section className="effects-panel" aria-labelledby="effects-title" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(!publishing)onClose();}}}>
    <header><div><p className="eyebrow">DIREÇÃO DE AMBIENTE</p><h2 id="effects-title" tabIndex={-1} ref={heading}>A atmosfera da história.</h2></div><button className="icon-button" disabled={publishing} aria-label="Fechar efeitos" onClick={onClose}><X size={19}/></button></header>
    <p className="effects-intro">Combine luz, clima e textura para dar vida a este mapa.</p>
    <form onSubmit={submit}><fieldset disabled={publishing}>
      <div className="effects-preview-row"><label><input type="checkbox" checked={preview} onChange={event=>setPreview(event.target.checked)}/>Prévia no meu mapa</label><span>{count} ligados</span></div>
      <div className="effects-intensity"><label htmlFor="effects-intensity">Intensidade visual <output>{draft.intensity}%</output></label><input id="effects-intensity" type="range" min={10} max={100} step={5} value={draft.intensity} onChange={event=>setDraft({...draft,intensity:Number(event.target.value)})}/><small>Suave nas luzes e partículas. Pins continuam legíveis.</small></div>
      {groups.map(group=><div className="effects-group" key={group}><h3>{group}</h3>{effectOptions.filter(option=>option.group===group).map(option=><label className="effect-option" key={option.id}><span><strong>{option.name}</strong><small>{option.detail}</small></span><input type="checkbox" role="switch" aria-label={option.name} checked={Boolean(draft[option.id as keyof Effects])} onChange={event=>setDraft({...draft,[option.id]:event.target.checked})}/></label>)}</div>)}
      <div className="effects-presets"><button type="button" className="text-link" onClick={()=>setDraft({...defaultEffects})}><RotateCcw size={13}/>Restaurar padrão</button><button type="button" className="text-link" onClick={()=>setDraft({...draft,...Object.fromEntries(effectOptions.map(option=>[option.id,false]))})}>Desligar todos</button></div>
      <p className="effects-note"><Sparkles size={15}/>A prévia é só sua. Após salvar, os jogadores recebem os efeitos ao clicar em Atualizar mapa. Nuvens já desenhadas na imagem original permanecem.</p>
      {state.revision!==revision&&<p className="form-error" role="alert">O mapa mudou. Feche, atualize e reabra este painel antes de salvar.</p>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={state.revision!==revision}><Check size={15}/>{publishing?'Salvando…':'Salvar efeitos'}</button></footer>
    </fieldset></form>
  </section>;
}
