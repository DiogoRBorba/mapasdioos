import { useEffect, useRef, useState } from 'react';
import { Check, Crosshair, LoaderCircle, X } from 'lucide-react';
import { pinCategories, pinColors, pinIcons, pinShapes } from '../../shared/map.js';
import { PinPreview, SymbolIcon } from './PinSymbol';
import type { Pin, MapPageRecord } from './types';
import PinImagesField from './PinImagesField';
import { customSymbols } from '../../shared/custom-symbols.js';

const iconLabels: Record<string, string> = { pin: 'Marcador', landmark: 'Edificação', target: 'Alvo', book: 'Livro', users: 'Pessoas', skull: 'Caveira', flag: 'Bandeira', key: 'Chave' };
const shapeLabels: Record<string, string> = { marker: 'Gota', circle: 'Círculo', diamond: 'Losango' };
export default function PinEditor({ pin, isNew, busy, error, onChange, onSave, onClose, onReposition, onDraw, pages, mapId }: { pages:MapPageRecord[]; mapId:string; pin: Pin; isNew: boolean; busy: boolean; error: string; onChange: (pin: Pin) => void; onSave: () => void; onClose: () => void; onReposition: () => void; onDraw:(pin:Pin)=>void }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [discard, setDiscard] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { titleRef.current?.focus(); }, [pin.id]);
  return <section className="pin-panel pin-editor" aria-labelledby="editor-title" onKeyDown={event => { if (event.key === 'Escape' && !busy && !uploading) setDiscard(true); }}>
    <div className="pin-panel-heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h2 id="editor-title">{pin.category==='map-pages'?(isNew?'Nova página de mapa':'Editar página de mapa'):pin.vertices?(isNew?'Novo território':'Editar território'):(isNew ? 'Novo pin' : 'Editar pin')}</h2></div><button className="icon-button" onClick={() => setDiscard(true)} disabled={busy || uploading} aria-label="Fechar editor"><X size={19}/></button></div>
    {discard ? <div className="discard-prompt"><p>Descartar as alterações deste pin?</p><button className="button secondary" onClick={() => setDiscard(false)}>Continuar editando</button><button className="button primary" onClick={onClose}>Descartar</button></div> : <form onSubmit={event => { event.preventDefault(); if (!uploading && !busy) onSave(); }}>
      <fieldset disabled={busy || uploading}>
        <label htmlFor="pin-title">Nome / título <span>*</span></label><input ref={titleRef} id="pin-title" value={pin.title} onChange={event => onChange({ ...pin, title: event.target.value })} maxLength={120} placeholder="Dê um nome a este lugar…" required/>
        {pin.category!=='map-pages'&&<><label htmlFor="pin-category">Categoria</label><select id="pin-category" value={pin.category} onChange={event => { const category = pinCategories.find(item => item.id === event.target.value)!; const next={ ...pin, category: category.id, icon: category.icon, color: category.color,vertices:undefined }; if(category.id==='territories')onDraw(next);else onChange(next); }}>{pinCategories.filter(category=>category.id!=='map-pages').map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></>}
        {pin.category==='map-pages'&&<><label htmlFor="pin-target-map">Mapa de destino</label><select id="pin-target-map" value={pin.targetMapId||''} required onChange={event=>onChange({...pin,targetMapId:event.target.value})}><option value="" disabled>Escolha o mapa…</option>{mapId!=='main'&&<option value="main">Mapa principal</option>}{pages.filter(page=>page.id!==mapId).map(page=><option key={page.id} value={page.id}>{page.title}</option>)}</select><button type="button" className="reposition-button" onClick={()=>onDraw(pin)}>Redesenhar área clicável</button></>}
        {pin.category==='territories'&&<button type="button" className="reposition-button" onClick={()=>onDraw(pin)}>{pin.vertices?`Redesenhar território · ${pin.vertices.length} pontos`:'Desenhar território com linhas'}</button>}
        <label htmlFor="pin-description">Descrição <small>opcional</small></label><textarea id="pin-description" value={pin.description} onChange={event => onChange({ ...pin, description: event.target.value })} maxLength={4000} rows={4} placeholder="O que os jogadores podem descobrir aqui?"/>
        <PinImagesField images={pin.images || []} onChange={images => onChange({ ...pin, images })} onBusy={setUploading}/>
        <span className="editor-label">Símbolo</span><div className="symbol-picker" role="group" aria-label="Símbolo do pin">{pinIcons.filter(icon=>!icon.startsWith('custom-')).map(icon => <button type="button" key={icon} aria-label={iconLabels[icon]} title={iconLabels[icon]} aria-pressed={pin.icon === icon} onClick={() => onChange({ ...pin, icon })}><SymbolIcon name={icon}/></button>)}</div>
        <details className="custom-symbols" open><summary>Símbolos Dioos <span>{customSymbols.length}</span></summary><div className="symbol-picker custom-symbol-picker" role="group" aria-label="Símbolos enviados pelo Mestre">{customSymbols.map(symbol=><button type="button" key={symbol.id} title={symbol.label} aria-label={`Símbolo ${symbol.label}`} aria-pressed={pin.icon===symbol.id} onClick={()=>onChange({...pin,icon:symbol.id})}><SymbolIcon name={symbol.id} size={26}/></button>)}</div></details>
        <span className="editor-label">Formato</span><div className="shape-picker" role="group" aria-label="Formato do pin">{pinShapes.map(shape => <button type="button" key={shape} aria-pressed={pin.shape === shape} onClick={() => onChange({ ...pin, shape })}>{shapeLabels[shape]}</button>)}</div>
        <span className="editor-label">Cor</span><div className="color-picker">{pinColors.map(color => <button type="button" className="color-swatch" style={{ backgroundColor: color }} key={color} aria-label={`Cor ${color}`} aria-pressed={pin.color === color} onClick={() => onChange({ ...pin, color })}>{pin.color === color && <Check size={15}/>}</button>)}<label className="custom-color" title="Cor personalizada"><span className="sr-only">Cor personalizada</span><input type="color" value={pin.color} onChange={event => onChange({ ...pin, color: event.target.value })}/></label></div>
        <div className="pin-preview-row"><PinPreview pin={pin}/><div><strong>Prévia do pin</strong><span>{pinCategories.find(category => category.id === pin.category)?.label}</span></div><button type="button" className="icon-button" onClick={onReposition} aria-label="Alterar posição no mapa" title="Alterar posição no mapa"><Crosshair size={18}/></button></div>
        {!pin.vertices&&<button type="button" className="reposition-button" onClick={onReposition}><Crosshair size={14}/> Alterar posição no mapa</button>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" type="submit" disabled={busy || uploading || !pin.title.trim() || (isNew&&pin.category==='territories'&&!pin.vertices)||(pin.category==='map-pages'&&(!pin.vertices||!pin.targetMapId))}>{busy ? <><LoaderCircle className="spin" size={16}/> Salvando…</> : <><Check size={16}/>{isNew ? (pin.category==='map-pages'?'Criar página de mapa':pin.vertices?'Criar território':'Criar pin') : 'Salvar alterações'}</>}</button>
      <p className="editor-footnote">Visível para todos os jogadores após salvar.</p>
    </form>}
  </section>;
}
