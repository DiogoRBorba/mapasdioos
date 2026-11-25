import { campaignApi } from '../CampaignContext';
import { campaignName } from '../../shared/campaigns.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, Crosshair, Eye, Image as ImageIcon, Layers3, LoaderCircle, Map as MapIcon, Maximize, Minus, Pencil, Plus, Search, Shield, SlidersHorizontal, Trash2, Wind, Sparkles, X } from 'lucide-react';
import { pinCategories } from '../../shared/map.js';
import type { AccessRole, Campaign } from '../campaigns';
import MapCanvas from './MapCanvas';
import PinEditor from './PinEditor';
import PinGallery from './PinGallery';
import HuntClock from './HuntClock';
import useHuntState, { type Effects } from './useHuntState';
import EffectsPanel from './EffectsPanel';
import { defaultEffects } from '../../shared/effects.js';
import useMapTransition from './useMapTransition';
import { PinPreview, SymbolIcon } from './PinSymbol';
import type { MapControls, Pin, Point, MapPageRecord } from './types';
import MapPagesManager from './MapPagesManager';
import { MAX_TERRITORY_POINTS, validateTerritory, territoryCenter } from '../../shared/territories.js';
import './map.css';
import './hunt.css';
import './pin-images.css';
import './map-pages.css';

function NewPinChoice({onClose,onPoint,onTerritory,onPage}:{onClose:()=>void;onPoint:()=>void;onTerritory:()=>void;onPage:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog className="access-dialog new-pin-choice" ref={dialog} aria-labelledby="new-pin-choice-title" onCancel={onClose}><button className="icon-button dialog-close" onClick={onClose} aria-label="Fechar escolha de pin"><X size={20}/></button><p className="eyebrow">ADMINISTRAÇÃO DO MAPA</p><h2 id="new-pin-choice-title">Uma nova descoberta.</h2><button className="pin-kind-option" onClick={onPoint}><Plus size={23}/><span><strong>Pin pontual</strong><small>Marque um lugar, uma memória ou um encontro.</small></span></button><button className="pin-kind-option" onClick={onTerritory}><Layers3 size={23}/><span><strong>Território com linhas</strong><small>Desenhe o contorno por cliques e feche no primeiro ponto.</small></span></button><button className="pin-kind-option" onClick={onPage}><MapIcon size={23}/><span><strong>Páginas de mapa</strong><small>Desenhe uma área clicável para abrir outro mapa da campanha.</small></span></button></dialog>;
}

type PageProps = { campaign: Campaign; role: AccessRole; onExit: () => void; leaving: boolean; exitError: string; onExpired: () => void; exitLabel?: string };
export default function MapPage(props:PageProps) {
  const [mapId,setMapId]=useState('main');
  const [pages,setPages]=useState<MapPageRecord[]>([]);
  const page=pages.find(item=>item.id===mapId);
  return <MapScene key={`${props.campaign.id}:${mapId}:${page?.image.id||'main'}`} {...props} mapId={mapId} pages={pages} onPages={setPages} onNavigate={setMapId}/>;
}
function MapScene({ campaign, role, onExit, leaving, exitError, onExpired, exitLabel = 'Retornar às campanhas',mapId,pages,onPages,onNavigate }: PageProps & {mapId:string;pages:MapPageRecord[];onPages:(pages:MapPageRecord[])=>void;onNavigate:(id:string)=>void}) {
  const admin = role === 'admin';
  const activePage=pages.find(page=>page.id===mapId);
  const mapCampaign=activePage?{...campaign,title:activePage.title,subtitle:'',map:{...activePage.image,builtin:false}}:campaign;
  const [managingMaps,setManagingMaps]=useState(false);
  const [drawingKind,setDrawingKind]=useState<'territories'|'map-pages'>('territories');
  const pinsUrl=campaignApi(`/api/map-pins?map=${encodeURIComponent(mapId)}`,campaign.id);
  const hunt = useHuntState(onExpired, campaign.id);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<'original' | 'restored'>('restored');
  const reducedMotion = prefersReducedMotion || paused;
  const [editingEffects,setEditingEffects]=useState(false);
  const [previewEffects,setPreviewEffects]=useState<Effects|null>(null);
  const transition = useMapTransition(hunt.state, reducedMotion);
  const effects=previewEffects || transition.presented?.effects || defaultEffects;
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setPrefersReducedMotion(preference.matches);
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);
  const shellRef = useRef<HTMLDivElement>(null);
  const controls = useRef<MapControls | null>(null);
  const expiredRef = useRef(onExpired); expiredRef.current = onExpired;
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [enabled, setEnabled] = useState(new Set(pinCategories.map(category => category.id)));
  const [query, setQuery] = useState('');
  const [sidebar, setSidebar] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pin | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [placing, setPlacing] = useState<'new' | 'move' | null>(null);
  const [choosingKind,setChoosingKind]=useState(false);
  const [drawing,setDrawing]=useState<Point[]|null>(null);
  const [drawingError,setDrawingError]=useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [zoom, setZoom] = useState(100);
  const sequence = useRef(0);
  const fetchBusy = useRef(false);
  const mutationBusy = useRef(false);
  const requests = useRef(new Set<AbortController>());

  const refresh = useCallback(async () => {
    if (fetchBusy.current || mutationBusy.current) return false;
    fetchBusy.current = true;
    const version = ++sequence.current;
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const response = await fetch(pinsUrl, { signal: controller.signal });
      if (response.status === 401) { expiredRef.current(); return false; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const catalogResponse=await fetch(campaignApi('/api/map-pins?action=pages',campaign.id),{signal:controller.signal});
      if(catalogResponse.status===401){expiredRef.current();return false;}
      const catalog=await catalogResponse.json();if(!catalogResponse.ok)throw new Error(catalog.error);
      if (version === sequence.current && !controller.signal.aborted) { setPins(current => JSON.stringify(current) === JSON.stringify(data.pins) ? current : data.pins); onPages(catalog.pages); setLoadError(''); return true; }
      return false;
    } catch (err) { if (!controller.signal.aborted && version === sequence.current) setLoadError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Conexão interrompida. Clique em Atualizar mapa para tentar novamente.'); return false; }
    finally { if (!controller.signal.aborted) setLoading(false); fetchBusy.current = false; requests.current.delete(controller); }
  }, [campaign.id,pinsUrl,onPages]);
  useEffect(() => {
    void refresh();
    return () => { requests.current.forEach(controller => controller.abort()); fetchBusy.current = false; };
  }, [refresh]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && (placing||drawing!==null)) { setPlacing(null);setDrawing(null);setDrawingError('');setToast('Desenho ou posicionamento cancelado.'); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [placing,drawing]);

  const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visiblePins = useMemo(() => pins.filter(pin => enabled.has(pin.category) && normalized(`${pin.title} ${pin.description}`).includes(normalized(query))), [pins, enabled, query]);
  const selected = visiblePins.find(pin => pin.id === selectedId);
  const counts = Object.fromEntries(pinCategories.map(category => [category.id, pins.filter(pin => pin.category === category.id).length]));

  async function refreshMap() {
    if (refreshing || draft || placing || drawing!==null) return;
    setRefreshing(true);
    try {
      const results = await Promise.all([refresh(), hunt.refresh()]);
      if (results.every(Boolean)) setToast('Mapa atualizado. Você está vendo as descobertas mais recentes.');
    } finally { setRefreshing(false); }
  }
  function selectPin(id: string) {
    if (draft || placing || drawing!==null) return;
    const pin=pins.find(item=>item.id===id);
    if(!admin&&pin?.targetMapId){onNavigate(pin.targetMapId);return;}
    setSelectedId(id); setRemoveConfirm(false); setError('');
    if (window.matchMedia('(max-width: 760px)').matches) setSidebar(false);
  }
  function startPin() {
    if (!admin || draft || busy) return;
    setSelectedId(null); setPlacing('new'); setError('');
    setChoosingKind(false);
    if (window.matchMedia('(max-width: 760px)').matches) setSidebar(false);
  }
  function startTerritory(source?:Pin,kind:'territories'|'map-pages'='territories') {
    if(!admin||busy)return;
    setDrawingKind(source?.category==='map-pages'?'map-pages':kind);
    setChoosingKind(false);setSelectedId(null);setPlacing(null);setDrawing([]);setDrawingError('');setError('');
    if(source)setDraft(source);
    if(window.matchMedia('(max-width: 760px)').matches)setSidebar(false);
  }
  function startPage(){
    setChoosingKind(false);
    if(!pages.length){setManagingMaps(true);return;}
    startTerritory(undefined,'map-pages');
  }
  function addVertex(point:Point) {
    if(!admin||drawing===null)return;
    if(drawing.length>=MAX_TERRITORY_POINTS){setDrawingError(`Limite de ${MAX_TERRITORY_POINTS} pontos. Feche no ponto inicial ou desfaça um ponto.`);return;}
    setDrawing(current=>current?[...current,point]:current);setDrawingError('');
  }
  function finishTerritory() {
    if(!admin||drawing===null)return;
    try {
      const vertices=validateTerritory(drawing),category=pinCategories.find(item=>item.id===drawingKind)!;
      if(draft)setDraft({...draft,category:drawingKind,vertices,...territoryCenter(vertices)});
      else {setDraft({id:crypto.randomUUID(),revision:0,title:'',description:'',category:category.id,icon:category.icon,shape:'marker',color:category.color,vertices,...territoryCenter(vertices),...(drawingKind==='map-pages'?{targetMapId:mapId==='main'?(pages[0]?.id||''):'main'}:{})});setIsNew(true);}
      setDrawing(null);setDrawingError('');
    }catch(err){setDrawingError(err instanceof Error?err.message:'Revise o contorno.');}
  }
  function choosePoint(point: Point) {
    if (!admin || !placing) return;
    if (placing === 'move' && draft) setDraft({ ...draft, ...point });
    else {
      const category = pinCategories[0];
      setDraft({ id: crypto.randomUUID(), title: '', description: '', category: category.id, icon: category.icon, shape: 'marker', color: category.color, ...point, revision: 0 });
      setIsNew(true);
    }
    setPlacing(null);
  }
  async function mutate(method: string, body: Pin | { id: string; revision: number }) {
    mutationBusy.current = true;
    setBusy(true); setError(''); ++sequence.current;
    try {
      const response = await fetch(pinsUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.status === 401) { expiredRef.current(); return false; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar. Tente novamente.');
      if (method === 'DELETE') { setPins(current => current.filter(pin => pin.id !== body.id)); setSelectedId(null); setRemoveConfirm(false); setToast('Pin removido do mapa.'); }
      else {
        const saved = data.pin as Pin;
        setPins(current => [...current.filter(pin => pin.id !== saved.id), saved]);
        setEnabled(current => new Set([...current, saved.category])); setQuery(''); setSelectedId(saved.id); setDraft(null); setPlacing(null);
        setToast(method === 'POST' ? 'Pin criado. Os jogadores já podem visualizá-lo.' : 'Alterações salvas.');
      }
    } catch (err) { setError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Conexão interrompida. Confira o mapa antes de tentar salvar novamente.'); }
    finally { mutationBusy.current = false; setBusy(false); void refresh(); }
  }
  const saveDraft = () => { if (draft && admin) void mutate(isNew ? 'POST' : 'PATCH', draft); };

  return <div className="map-app" ref={shellRef}>
    {choosingKind&&<NewPinChoice onClose={()=>setChoosingKind(false)} onPoint={startPin} onTerritory={()=>startTerritory()} onPage={startPage}/> }
    {managingMaps&&<MapPagesManager campaignId={campaign.id} pages={pages} onClose={()=>setManagingMaps(false)} onExpired={onExpired} onSaved={page=>onPages([...pages.filter(item=>item.id!==page.id),page])}/>}
    <header className="map-header">
      <button className="map-back" onClick={onExit} disabled={leaving} aria-label={exitLabel} title={exitLabel}><ArrowLeft size={19}/></button>
      <div className="map-heading"><span>DIOOSMAPAS <span>/</span> CAMPANHA {campaign.number}</span><h1>{activePage?.title||campaignName(campaign)}</h1></div>
      <div className="map-header-actions"><span className="map-role">{admin ? <Shield size={14}/> : <Eye size={14}/>}<span>{admin ? 'Dioos · Administrador' : 'Jogador'}</span></span>{admin && <button className="button primary new-pin-button" disabled={editingEffects || !!draft || !!placing || drawing!==null || loading || !!loadError || busy} onClick={()=>setChoosingKind(true)}><Plus size={16}/> Novo pin</button>}<button className="map-tool sidebar-toggle" aria-label={sidebar ? 'Fechar filtros' : 'Abrir filtros'} aria-expanded={sidebar} aria-controls="map-sidebar" onClick={() => setSidebar(value => !value)}><SlidersHorizontal size={19}/></button></div>
    </header>
    <div className="map-body">
      {sidebar && <aside className="map-sidebar" id="map-sidebar" aria-label="Filtros e pontos de interesse">
        <div className="map-sidebar-title"><div><p className="eyebrow">O ATLAS</p><h2>Explore o mapa.</h2></div><button className="icon-button" onClick={() => setSidebar(false)} aria-label="Recolher filtros"><ChevronLeft size={18}/></button></div>
        {(admin||pages.length>0)&&<div className="map-page-picker"><label htmlFor="current-map-page">Mapas da campanha</label><select id="current-map-page" value={mapId} disabled={!!draft||!!placing||drawing!==null||busy||editingEffects} onChange={event=>onNavigate(event.target.value)}><option value="main">Mapa principal</option>{pages.map(page=><option key={page.id} value={page.id}>{page.title}</option>)}</select>{admin&&<button className="button secondary" disabled={!!draft||!!placing||drawing!==null||busy||editingEffects} onClick={()=>setManagingMaps(true)}><Plus size={14}/> Gerenciar mapas</button>}</div>}
        <label className="map-search"><Search size={16}/><span className="sr-only">Buscar pins</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar no mapa…"/></label>
        <div className="filter-heading"><span>FILTRAR POR CATEGORIA</span><Layers3 size={13}/></div>
        <div className="filter-actions"><button onClick={() => setEnabled(new Set(pinCategories.map(category => category.id)))}>Mostrar todos</button><span>·</span><button onClick={() => setEnabled(new Set())}>Ocultar todos</button></div>
        <div className="category-filters">{pinCategories.map(category => <label key={category.id} className={`category-filter ${enabled.has(category.id) ? 'is-enabled' : ''}`}>
          <input type="checkbox" checked={enabled.has(category.id)} onChange={() => setEnabled(current => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}/><span className="category-symbol" style={{ color: category.color }}><SymbolIcon name={category.icon}/></span><span>{category.label}</span><span className="category-count">{counts[category.id]}</span><span className="category-check" aria-hidden="true">{enabled.has(category.id) && <Check size={12}/>}</span>
        </label>)}</div>
        <div className="pin-results-heading"><span>PONTOS DE INTERESSE</span><span aria-live="polite">{visiblePins.length} / {pins.length}</span></div>
        {loading ? <div className="sidebar-empty"><LoaderCircle className="spin" size={22}/><p>Carregando os pins…</p></div> : pins.length === 0 ? <div className="sidebar-empty"><MapIcon size={29} strokeWidth={1}/><h3>Um mapa por descobrir.</h3><p>{admin ? 'Crie o primeiro pin para dar início às descobertas da sua mesa.' : 'Os pontos de interesse aparecerão aqui quando o Mestre os adicionar.'}</p></div> : visiblePins.length === 0 ? <div className="sidebar-empty"><Search size={25}/><p>Nenhum pin com estes filtros.</p><button className="text-link" onClick={() => { setQuery(''); setEnabled(new Set(pinCategories.map(category => category.id))); }}>Limpar filtros</button></div> : <ul className="pin-list">{visiblePins.map(pin => <li key={pin.id}><button disabled={!!draft || !!placing || drawing!==null} onClick={() => { selectPin(pin.id); controls.current?.focus(pin); }}><span style={{ color: pin.color }}><SymbolIcon name={pin.icon}/></span><span>{pin.title}<small>{pinCategories.find(category => category.id === pin.category)?.label}</small></span></button></li>)}</ul>}
        <div className="sidebar-footer"><span className="sync-dot"/> {loadError ? 'Sincronização indisponível' : 'Use Atualizar mapa para buscar novidades'}</div>
      </aside>}
      <div className={`map-stage${mapId!=='main'?' has-map-page':''}${effects.dayLighting?'':' no-period-lighting'} period-${transition.presented?.period || 'afternoon'}${transition.startedAt !== null ? ' is-time-transition' : ''}`}>
        <MapCanvas mapId={mapId} effects={effects} campaign={mapCampaign} pins={visiblePins} selectedId={selectedId || undefined} draft={draft} placing={!!placing} drawing={drawing} onVertex={addVertex} onFinish={finishTerritory} period={transition.presented?.period || 'afternoon'} transition={transition.startedAt} reducedMotion={reducedMotion} quality={quality} onPick={choosePoint} onSelect={selectPin} onReady={value => { controls.current = value; }} onZoom={setZoom}/>
        {mapId!=='main'&&<button className="button secondary map-page-home" disabled={!!draft||!!placing||drawing!==null||busy||editingEffects} onClick={()=>onNavigate('main')}><ArrowLeft size={16}/> Mapa principal</button>}
        {admin&&editingEffects&&hunt.state&&<EffectsPanel state={hunt.state} publishing={hunt.publishing} onPreview={setPreviewEffects} onClose={()=>{setEditingEffects(false);setPreviewEffects(null);}} onPublish={hunt.publish}/>}
        <HuntClock state={transition.presented} admin={admin} syncError={hunt.syncError} publishing={hunt.publishing} disabled={editingEffects || !!draft || !!placing || drawing!==null || transition.startedAt !== null} refreshing={refreshing} onRefresh={() => void refreshMap()} onPublish={hunt.publish}/>
        <div className="map-location-label"><span className="tiny-compass">✧</span><div><strong>{activePage?.title||campaignName(campaign)}</strong><span>{activePage?'PÁGINA DE MAPA':'MAPA DA CAMPANHA'}</span></div></div>
        {!sidebar && <button className="map-tool reopen-filters" aria-label="Abrir filtros" onClick={() => setSidebar(true)}><SlidersHorizontal size={18}/><span>Filtros</span></button>}
        <div className="map-controls" aria-label="Controles do mapa"><button className="map-tool" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => controls.current?.zoomIn()}><Plus size={20}/></button><output aria-label="Nível de zoom">{zoom}%</output><button className="map-tool" aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => controls.current?.zoomOut()}><Minus size={20}/></button><span/><button className="map-tool" aria-label="Enquadrar mapa inteiro" title="Enquadrar mapa inteiro" onClick={() => controls.current?.fit()}><Crosshair size={19}/></button><button className="map-tool" aria-label="Alternar tela cheia" title="Tela cheia" onClick={() => { const action = document.fullscreenElement ? document.exitFullscreen() : shellRef.current?.requestFullscreen(); action?.catch(() => setToast('A tela cheia não está disponível neste navegador.')); }}><Maximize size={18}/></button></div>
        <div className="map-navigation-hint"><span>ARRASTE PARA EXPLORAR</span><span>·</span><span>ROLE PARA APROXIMAR</span></div>
        <div className="map-appearance-controls" aria-label="Aparência do mapa">
          {admin&&<button className="map-tool effects-open" aria-label="Personalizar efeitos" title="Personalizar efeitos desta campanha" aria-expanded={editingEffects} disabled={!hunt.state||hunt.publishing||!!hunt.syncError||!!draft||!!placing||drawing!==null||transition.startedAt!==null} onClick={()=>{setEditingEffects(value=>!value);setSelectedId(null);}}><Sparkles size={17}/><span>Efeitos</span></button>}
          {mapCampaign.map?.builtin && <button className="map-tool" aria-label={quality === 'restored' ? 'Ver mapa original' : 'Ver mapa restaurado'} title={quality === 'restored' ? 'Restaurado · ver original' : 'Original · ver restaurado'} aria-pressed={quality === 'restored'} onClick={() => setQuality(current => current === 'restored' ? 'original' : 'restored')}><ImageIcon size={17}/></button>}
          <button className="map-tool" aria-label={reducedMotion ? 'Ativar animações' : 'Pausar animações'} title={prefersReducedMotion ? 'Movimento reduzido pelo dispositivo' : reducedMotion ? 'Ativar animações' : 'Pausar animações'} disabled={prefersReducedMotion} aria-pressed={!reducedMotion} onClick={() => setPaused(current => !current)}><Wind size={17}/></button>
        </div>
        {placing && <div className="placement-banner" role="status"><Crosshair size={18}/><span>{placing === 'move' ? 'Escolha a nova posição do pin.' : 'Clique ou toque no mapa para posicionar o pin.'}</span><button onClick={() => setPlacing(null)} aria-label="Cancelar posicionamento"><X size={17}/></button></div>}
        {drawing!==null&&<div className="placement-banner territory-drawing-banner"><div role="status"><Layers3 size={18}/><span>{drawingError||(!drawing.length?(drawingKind==='map-pages'?'Clique no mapa para começar a área clicável.':'Clique no mapa para começar o território.'):`${drawing.length} pontos · Continue clicando. Para fechar, clique no ponto inicial.`)}</span></div><div className="territory-drawing-actions"><button disabled={!drawing.length} onClick={()=>{setDrawing(current=>current?.slice(0,-1)||[]);setDrawingError('');}}>Desfazer ponto</button><button disabled={drawing.length<3} onClick={finishTerritory}>{drawingKind==='map-pages'?'Fechar área':'Fechar território'}</button><button onClick={()=>{setDrawing(null);setDrawingError('');}}>Cancelar</button></div></div>}
        {(loadError || exitError) && <div className="map-alert" role="alert"><p>{exitError || loadError}</p><button onClick={() => void refresh()}>Tentar novamente</button></div>}
        {toast && <div className="map-toast" role="status"><Check size={16}/>{toast}</div>}
        {draft && !placing && drawing===null && <PinEditor pages={pages} mapId={mapId} pin={draft} isNew={isNew} busy={busy} error={error} onChange={pin => { setDraft(pin); setError(''); }} onSave={saveDraft} onClose={() => { setDraft(null); setPlacing(null); setError(''); }} onReposition={() => draft.vertices ? startTerritory(draft) : setPlacing('move')} onDraw={startTerritory}/>}
        {selected && !draft && !placing && drawing===null && <section className="pin-panel pin-details" aria-labelledby="pin-detail-title"><div className="pin-panel-heading"><div className="detail-symbol"><PinPreview pin={selected}/></div><button className="icon-button" aria-label="Fechar detalhes" onClick={() => { setSelectedId(null); setRemoveConfirm(false); }}><X size={19}/></button></div><p className="eyebrow">{pinCategories.find(category => category.id === selected.category)?.label}</p><h2 id="pin-detail-title">{selected.title}</h2>{selected.description && <p className="pin-description">{selected.description}</p>}
          <PinGallery key={selected.id} images={selected.images || []} title={selected.title}/>
          {selected.targetMapId&&<button className="button primary full pin-page-enter" onClick={()=>onNavigate(selected.targetMapId!)}><MapIcon size={16}/> Abrir mapa · {selected.targetMapId==='main'?'Principal':pages.find(page=>page.id===selected.targetMapId)?.title||'Área'}</button>}
          {admin && <div className="detail-actions">{removeConfirm ? <><p>Remover este pin do mapa?</p><button className="button secondary" disabled={busy} onClick={() => setRemoveConfirm(false)}>Cancelar</button><button className="button danger" disabled={busy} onClick={() => void mutate('DELETE', { id: selected.id, revision: selected.revision })}>{busy ? 'Removendo…' : 'Confirmar remoção'}</button></> : <><button className="button secondary" onClick={() => { setDraft({ ...selected }); setIsNew(false); setError(''); }}><Pencil size={14}/> Editar pin</button><button className="icon-button" onClick={() => setRemoveConfirm(true)} aria-label="Remover pin"><Trash2 size={16}/></button></>}</div>}{error && <p className="form-error" role="alert">{error}</p>}
        </section>}
      </div>
    </div>
  </div>;
}
