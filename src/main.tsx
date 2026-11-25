import CampaignAdmin from './CampaignAdmin';
import NewsPage, { NewsHero } from './News';
import XweeterFeed from './XweeterFeed';
import { CampaignContext, campaignApi } from './CampaignContext';
import { campaignName, campaignAvailable } from '../shared/campaigns.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, MapPin, Search, Shield, UserRound, X } from 'lucide-react';
import { type Campaign, type AccessRole } from './campaigns';
import './styles.css';
import './brand.css';
import MapPage from './map/MapPage';

const SocialPage = React.lazy(() => import('./social/SocialPage'));

type Session = { campaignId: string; role: AccessRole };
const isRole = (role: unknown): role is AccessRole => role === 'player' || role === 'admin';

function Logo({ className = '' }: { className?: string }) {
  return <img className={`dioos-logo ${className}`} src="/images/dioos-logo.png" alt="Dioos RPG"/>;
}

function useDialog(ref: React.RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; dialog?.close(); opener?.focus(); };
  }, [ref]);
}

function AccessDialog({ campaign, onClose, onEnter }: { campaign: Campaign; onClose: () => void; onEnter: (session: Session) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [role, setRole] = useState<AccessRole>('player');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useDialog(ref);
  useEffect(() => () => requestRef.current?.abort(), []);
  function changeRole(next: AccessRole) { setRole(next); setPassword(''); setVisible(false); setError(''); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setBusy(true);
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const response = await fetch('/api/campaign-access', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: campaign.id, role, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir a campanha.');
      if (data.authenticated !== true || data.campaignId !== campaign.id || !isRole(data.role)) throw new Error('Não foi possível confirmar o acesso. Tente novamente.');
      setPassword(''); onEnter({ campaignId: data.campaignId, role: data.role });
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Não foi possível conectar. Tente novamente.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <dialog ref={ref} className="access-dialog" aria-labelledby="access-title" aria-describedby="access-description" onCancel={onClose} onClick={e => {
    if (e.target === ref.current) { const r = ref.current!.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); }
  }}>
    <button className="icon-button dialog-close" aria-label="Fechar" onClick={onClose}><X size={20}/></button>
    <div className="dialog-symbol">{role === 'admin' ? <Shield size={25} strokeWidth={1.3}/> : <KeyRound size={25} strokeWidth={1.3}/>}</div>
    <p className="eyebrow">{campaignName(campaign)}</p><h2 id="access-title">Além do véu.</h2>
    <p id="access-description">Escolha seu acesso e use a senha correspondente para abrir a passagem.</p>
    <form onSubmit={submit}>
      <fieldset className="role-selector" disabled={busy}><legend className="sr-only">Tipo de acesso</legend>
        <label className={role === 'player' ? 'role-option selected' : 'role-option'}><input type="radio" name="access-role" value="player" checked={role === 'player'} onChange={() => changeRole('player')}/><UserRound size={16}/><span>Jogador</span></label>
        <label className={role === 'admin' ? 'role-option selected' : 'role-option'}><input type="radio" name="access-role" value="admin" checked={role === 'admin'} onChange={() => changeRole('admin')}/><Shield size={16}/><span>Administrador</span></label>
      </fieldset>
      <p className="role-description">{role === 'player' ? campaign.type === 'social' ? 'Entre na campanha e escolha seu personagem para viver este capítulo.' : 'Explore os mapas e acompanhe as descobertas da sua mesa.' : 'O acesso de Dioos para criar e conduzir os caminhos da mesa.'}</p>
      <label htmlFor="campaign-password">{role === 'admin' ? 'Senha de administrador' : 'Senha de jogador'}</label>
      <div className={`password-field ${error ? 'has-error' : ''}`}><LockKeyhole size={17}/>
        <input id="campaign-password" type={visible ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="A chave para a sua história" autoComplete="current-password" required maxLength={512} disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'access-error' : undefined}/>
        <button type="button" className="icon-button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
      </div>
      {error && <p className="form-error" id="access-error" role="alert">{error}</p>}
      <button className="button primary full" type="submit" disabled={busy || !password}>{busy ? <><LoaderCircle className="spin" size={18}/> Abrindo passagem…</> : <>{role === 'admin' ? 'Entrar como administrador' : 'Entrar como jogador'} <ArrowRight size={17}/></>}</button>
    </form><p className="dialog-note"><LockKeyhole size={13}/> Cada história tem sua chave.</p>
  </dialog>;
}

function GuideDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); useDialog(ref);
  return <dialog className="access-dialog guide-dialog" ref={ref} aria-labelledby="guide-title" onCancel={onClose}>
    <button className="icon-button dialog-close" aria-label="Fechar guia" onClick={onClose}><X size={20}/></button>
    <BookOpen className="guide-icon" size={30} strokeWidth={1.2}/><p className="eyebrow">Guia do viajante</p><h2 id="guide-title">Seu próximo passo.</h2>
    <ol className="guide-steps"><li><span>01</span><div><h3>Encontre sua história</h3><p>Navegue pelas campanhas usando as setas ou deslizando os banners no celular.</p></div></li><li><span>02</span><div><h3>Escolha seu acesso</h3><p>Entre como jogador ou administrador, cada um com sua própria senha.</p></div></li><li><span>03</span><div><h3>Abra a passagem</h3><p>Arraste o mapa, aproxime os detalhes e filtre as descobertas. O administrador pode criar e editar os pins.</p></div></li></ol>
    <button className="button primary full" onClick={onClose}>Voltar às campanhas <ArrowRight size={17}/></button>
  </dialog>;
}

function CampaignCarousel({ items, onEnter }: { items: Campaign[]; onEnter: (campaign: Campaign) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const itemIds = items.map(c => c.id).join(',');
  useEffect(() => { setActive(0); if (railRef.current) railRef.current.scrollLeft = 0; }, [itemIds]);
  function moveTo(index: number) {
    const rail = railRef.current;
    const slide = rail?.querySelector<HTMLElement>(`[data-slide="${index}"]`);
    if (!rail || !slide) return;
    rail.scrollTo({ left: slide.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function trackPosition() {
    const rail = railRef.current; if (!rail) return;
    const distances = Array.from(rail.querySelectorAll<HTMLElement>('[data-slide]')).map(slide => Math.abs(slide.offsetLeft - rail.scrollLeft));
    setActive(distances.indexOf(Math.min(...distances)));
  }
  return <div className="carousel" role="region" aria-roledescription="carrossel" aria-label="Campanhas de RPG">
    <div className="collection-meta"><span>COLEÇÃO DE CAMPANHAS</span><div className="carousel-top-controls"><span>{String(items.length).padStart(2, '0')} histórias no atlas</span><button className="carousel-arrow" aria-label="Campanha anterior" onClick={() => moveTo(active - 1)} disabled={active <= 0} aria-controls="campaign-rail"><ChevronLeft size={18}/></button><button className="carousel-arrow" aria-label="Próxima campanha" onClick={() => moveTo(active + 1)} disabled={active >= items.length - 1} aria-controls="campaign-rail"><ChevronRight size={18}/></button></div></div>
    <div className="campaign-rail" id="campaign-rail" ref={railRef} onScroll={trackPosition} tabIndex={0} aria-label="Banners de campanhas. Use as setas do teclado para navegar." onKeyDown={e => {
      if (e.target !== e.currentTarget) return;
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); moveTo(e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowRight' ? 1 : -1)))); }
    }}>
      {items.map((item, index) => <article key={item.id} data-slide={index} className={`campaign-card ${item.placeholder && !item.image && !item.subtitle && !item.description ? 'placeholder-card' : 'featured-card'}`} role="group" aria-roledescription="slide" aria-label={`${item.title}, ${index + 1} de ${items.length}`}>
        {item.placeholder && !item.image && !item.subtitle && !item.description ? <h3>{item.title}</h3> : <>{item.image && <img className="campaign-art" src={item.image} alt={`Capa de ${campaignName(item)}`} fetchPriority={index === 0 ? 'high' : 'auto'}/>}
          <div className="campaign-vignette"/><div className="card-topline"><span className="campaign-number">CAMPANHA <b>{String(index+1).padStart(2,'0')}</b></span><span className="access-badge"><LockKeyhole size={12}/> Acesso por senha</span></div>
          <div className="card-content"><p className="card-eyebrow"><span/> Um novo capítulo espera por você</p><h3>{item.title}{item.subtitle && <><br/><em>{item.subtitle}</em></>}</h3><p className="card-description">{item.description}</p><button className="button primary" disabled={!campaignAvailable(item)} onClick={() => onEnter(item)}>{campaignAvailable(item) ? 'Entrar na campanha' : 'Em preparação'} <ArrowRight size={18}/></button></div>
          <div className="card-bottom"><span>UMA HISTÓRIA DIOOS RPG</span><span className="card-seal" aria-hidden="true">{String(index+1).padStart(2,'0')} / {String(items.length).padStart(2, '0')}</span></div>
        </>}
      </article>)}
    </div>
    <div className="carousel-bottom"><span className="carousel-hint">Explore outras histórias <ArrowRight size={13}/></span><div className="carousel-pagination" aria-label="Escolher banner">{items.map((item,index) => <button key={item.id} onClick={() => moveTo(index)} aria-label={`Ir para campanha ${String(index+1).padStart(2,'0')}: ${item.title}`} aria-current={active === index ? 'true' : undefined}><span/>{String(index+1).padStart(2,'0')}</button>)}</div><span className="sr-only" aria-live="polite">{items[active]?.title}</span></div>
  </div>;
}

function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [orderRevision,setOrderRevision]=useState(0);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSection,setAdminSection]=useState<'campaigns'|'news'>('campaigns');
  const loadCatalog = useCallback(async () => {
    try { const response = await fetch('/api/campaigns', {cache:'no-store'}); const data = await response.json(); if(!response.ok)throw new Error(data.error); setCampaigns(data.campaigns);setOrderRevision(data.orderRevision);setCatalogError(''); }
    catch(error){setCatalogError(error instanceof Error ? error.message : 'Não foi possível carregar as campanhas.');}
    finally{setCatalogLoading(false);}
  }, []);
  useEffect(() => { void loadCatalog(); },[loadCatalog]);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Campaign | null>(null);
  const [guide, setGuide] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [path, setPath] = useState(window.location.pathname);
  const [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const campaign = campaigns.find(item => path === `/campanhas/${item.id}`);
  const isCampaign = !!campaign;
  const isNews = path === '/noticias' || path.startsWith('/noticias/');
  const isUnknown = path !== '/' && !isNews && !isCampaign && !catalogLoading;
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = campaigns.filter(c => normalize(campaignName(c)).includes(normalize(query)));
  useEffect(() => { const pop = () => setPath(window.location.pathname); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  useEffect(() => {
    const controller = new AbortController(); setChecking(true);
    fetch(campaignApi('/api/campaign-access', campaign?.id), { signal: controller.signal }).then(r => r.json()).then(data => {
      if (!controller.signal.aborted) setSession(data.authenticated === true && data.campaignId === campaign?.id && isRole(data.role) ? { campaignId: data.campaignId, role: data.role } : null);
    }).catch(() => { if (!controller.signal.aborted) setSession(null); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [path, campaign?.id]);
  useEffect(() => { if(isNews)return; document.title = isCampaign ? `${campaignName(campaign)} — DioosMapas` : 'DioosMapas — Atlas de campanhas'; }, [isCampaign, isNews, campaign?.title, campaign?.subtitle]);
  function navigate(next: string) { window.history.pushState({}, '', next); setPath(next); window.scrollTo({ top: 0, behavior: 'instant' }); }
  async function returnHome() {
    setLeaving(true); setNotice('');
    try { const response = await fetch(campaignApi('/api/campaign-access',campaign?.id), { method: 'DELETE' }); if (!response.ok) throw new Error(); setSession(null); await loadCatalog(); navigate('/'); }
    catch { setNotice('Não foi possível encerrar o acesso. Tente novamente.'); }
    finally { setLeaving(false); }
  }
  if (campaign?.type === 'social' && !checking && session?.campaignId === campaign.id) return <CampaignContext.Provider value={campaign.id}><React.Suspense fallback={<div className="empty-search">Abrindo o campus…</div>}><SocialPage key={campaign.id} campaign={campaign} role={session.role} onExit={returnHome} leaving={leaving} exitError={notice} onExpired={() => setSession(null)}/></React.Suspense></CampaignContext.Provider>;
  if (campaign?.map && !checking && session?.campaignId === campaign.id) return <CampaignContext.Provider value={campaign.id}><MapPage key={`${campaign.id}-${campaign.revision}`} campaign={campaign} role={session.role} onExit={returnHome} leaving={leaving} exitError={notice} onExpired={() => setSession(null)}/></CampaignContext.Provider>;
  return <>
    <a href="#main" className="skip-link">Pular para o conteúdo</a>
    <header className="site-header"><div className="header-inner">
      <a href="/" className="brand" aria-label="DioosMapas, página inicial" onClick={e => { e.preventDefault(); navigate('/'); }}><Logo className="header-logo"/><span>DIOOS<span className="brand-accent">MAPAS</span><small>ATLAS DE CAMPANHAS</small></span></a>
      <nav aria-label="Navegação principal"><a href="/#campanhas" className={path==='/' ? 'nav-active' : ''} onClick={e => { if (path !== '/') { e.preventDefault(); navigate('/'); requestAnimationFrame(() => document.getElementById('campanhas')?.scrollIntoView()); } }}>Campanhas</a><a href="/noticias" className={isNews?'nav-active':''} onClick={event=>{if(!event.ctrlKey&&!event.metaKey){event.preventDefault();navigate('/noticias');}}}>Notícias</a><button onClick={() => setGuide(true)}>Como explorar <ArrowRight size={14}/></button></nav>
      <span className="header-caption">UM UNIVERSO DIOOS RPG</span><button className="icon-button landing-admin-button" aria-label="Administrar campanhas" title="Administrar campanhas" onClick={() => {setAdminSection(isNews?'news':'campaigns');setAdminOpen(true);}}><Shield size={19}/></button>
    </div></header>
    <main id="main">
      {isNews?<NewsPage key={path} id={path.slice('/noticias/'.length)||undefined} navigate={navigate} onAdmin={()=>{setAdminSection('news');setAdminOpen(true);}}/>:isUnknown ? <section className="campaign-room container"><p className="eyebrow">Fora dos caminhos conhecidos</p><h1>Página não encontrada.</h1><button className="button primary" onClick={() => navigate('/')}>Voltar às campanhas <ArrowRight size={17}/></button></section> : campaign ? <section className="campaign-room container">
        <Logo className="room-logo"/><h1>{campaignName(campaign)}</h1>{checking ? <p className="room-status"><LoaderCircle className="spin" size={16}/> Verificando a passagem…</p> : <button className="button primary" disabled={!campaignAvailable(campaign)} onClick={() => setDialog(campaign)}>{campaignAvailable(campaign) ? 'Escolher acesso' : 'Em preparação'} <KeyRound size={17}/></button>}<button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={16}/> Retornar à landing page</button>
      </section> : <>
        <section className="hero container" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow"><span className="small-line"/> Histórias para se perder. Mapas para se encontrar.</p><h1 id="hero-title">Toda jornada começa<br/>com <em>um lugar.</em></h1><p className="hero-description">O mundo da sua mesa, além da imaginação.<br/>Escolha sua campanha. Encontre seu próximo caminho.</p><a className="hero-link" href="#campanhas">Explore as campanhas <ArrowDown size={16}/></a></div><NewsHero navigate={navigate}/></section>
        <section className="campaign-section container" id="campanhas" aria-labelledby="campaigns-heading">
          <div className="section-heading"><div><p className="eyebrow">Sua próxima história</p><h2 id="campaigns-heading">Escolha uma campanha<span className="count">{String(campaigns.length).padStart(2,'0')}</span></h2></div><label className="search-field"><Search size={17}/><span className="sr-only">Buscar campanha</span><input type="search" placeholder="Buscar campanha…" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
          {catalogError ? <div className="empty-search" role="alert"><p>{catalogError}</p><button className="button secondary" onClick={() => void loadCatalog()}>Tentar novamente</button></div> : catalogLoading ? <div className="empty-search"><LoaderCircle className="spin"/><p>Revelando as histórias…</p></div> : filtered.length ? <CampaignCarousel items={filtered} onEnter={setDialog}/> : <div className="empty-search"><Search size={28} strokeWidth={1}/><h3>Nenhum caminho por aqui.</h3><p>Nenhuma campanha encontrada para “{query}”.</p><button className="button secondary" onClick={() => setQuery('')}>Limpar busca <X size={15}/></button></div>}
        </section>
        <section className="atlas-note container" aria-label="Sobre o atlas"><div className="note-symbol"><MapPin size={25} strokeWidth={1.1}/></div><div><h2>Menos janelas. Mais imersão.</h2><p>Um lugar para os mapas, os destinos e as descobertas da sua mesa.</p></div><button className="text-link" onClick={() => setGuide(true)}>Conheça o atlas <ArrowRight size={16}/></button></section>
        <XweeterFeed/>
      </>}
    </main>
    <footer className="site-footer container"><div><span className="footer-wordmark">DIOOS RPG</span><span className="footer-divider"/> Cartografando histórias.</div><span>Feito para quem vive outras vidas.</span></footer>
    {adminOpen && <CampaignAdmin initialSection={adminSection} campaigns={campaigns} orderRevision={orderRevision} onReordered={(items,revision)=>{setCampaigns(items);setOrderRevision(revision);}} onClose={() => setAdminOpen(false)} onSaved={loadCatalog}/>}
    {dialog && <AccessDialog campaign={dialog} onClose={() => setDialog(null)} onEnter={verified => { setSession(verified); setDialog(null); navigate(`/campanhas/${verified.campaignId}`); }}/>} {guide && <GuideDialog onClose={() => setGuide(false)}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
