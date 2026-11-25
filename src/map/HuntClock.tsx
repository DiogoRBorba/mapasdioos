import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Pencil, RefreshCw, Sun, Sunrise, X } from 'lucide-react';
import { huntPeriods } from '../../shared/hunt.js';
import type { HuntState, MapHeader, MapStatePatch } from './useHuntState';

const periodIcon = (period: string, size = 23) => period === 'night' ? <Moon size={size}/> : period === 'morning' ? <Sunrise size={size}/> : <Sun size={size}/>;
type Props = { state: HuntState | null; admin: boolean; syncError: string; publishing: boolean; disabled: boolean; refreshing: boolean; onRefresh: () => void; onPublish: (state: MapStatePatch) => Promise<boolean> };

export default function HuntClock({ state, admin, syncError, publishing, disabled, refreshing, onRefresh, onPublish }: Props) {
  const [draft, setDraft] = useState<{ day: string; period: string; revision: number; header:MapHeader } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const node=clock.current,stage=node?.parentElement,status=node?.querySelector('.hunt-status'),refresh=node?.querySelector('.hunt-refresh-button');
    if(!node||!stage||!status||!refresh)return;
    const update=()=>{const bottom=node.offsetTop+(refresh as HTMLElement).offsetTop+(refresh as HTMLElement).offsetHeight+12;stage.style.setProperty('--clock-bottom',`${bottom}px`);stage.style.setProperty('--clock-editor-height',`${Math.max(80,stage.clientHeight-bottom-14)}px`);};
    const observer=new ResizeObserver(update);observer.observe(status);observer.observe(node);observer.observe(stage);update();
    return()=>{observer.disconnect();stage.style.removeProperty('--clock-bottom');stage.style.removeProperty('--clock-editor-height');};
  },[]);
  const close = () => { if (!publishing) { setDraft(null); setError(''); trigger.current?.focus(); } };
  useEffect(() => { if (disabled) { setDraft(null); setError(''); } }, [disabled]);
  useEffect(() => {
    if (!draft) return;
    panel.current?.querySelector('input')?.focus();
  }, [!!draft]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const day = Number(draft?.day);
  const valid = !!draft?.day.trim() && Number.isSafeInteger(day) && day >= 1;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !valid || publishing) return;
    setError('');
    try {
      if (await onPublish({ day, period: draft.period, revision: draft.revision, header:draft.header })) {
        setDraft(null); setMessage('Alteração aprovada e publicada para a mesa.'); trigger.current?.focus();
      }
    } catch (err) { setError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Não foi possível confirmar a publicação. Confira a conexão e tente novamente.'); }
  }
  return <div ref={clock} className={`hunt-clock ${draft ? 'is-editing' : ''}`}>
    <div className="hunt-status" aria-live="polite" aria-atomic="true">
      <span className="hunt-period-icon" aria-hidden="true">{periodIcon(state?.period || 'afternoon')}</span>
      <div className="hunt-status-text"><span className="hunt-eyebrow">{state?.header.label||'Dia da caça'}</span><strong className={state?.header.dateText?'hunt-date-custom':undefined}>{state ? state.header.dateText ? <>{state.header.dateText}<span className="hunt-period-line">{huntPeriods.find(period=>period.id===state.period)?.label}</span></> : <>{state.header.dayLabel} {state.day}<span className="hunt-separator">|</span>{huntPeriods.find(period => period.id === state.period)?.label}</> : 'Sincronizando…'}</strong></div>
      {admin && <button ref={trigger} className="hunt-edit-button" aria-label="Editar cabeçalho, data e período" aria-expanded={!!draft} aria-controls="hunt-editor" disabled={!state || publishing || disabled || !!syncError} onClick={() => { if (draft) close(); else if (state) { setDraft({ day: String(state.day), period: state.period, revision: state.revision, header:{...state.header} }); setError(''); setMessage(''); } }}><Pencil size={16}/></button>}
    </div>
    <button className="hunt-refresh-button" onClick={onRefresh} disabled={refreshing || publishing || disabled || !!draft} title="Buscar pins e mudanças aprovadas pelo mestre"><RefreshCw size={14} className={refreshing ? 'spin' : ''}/>{refreshing ? 'Atualizando…' : 'Atualizar mapa'}</button>
    {syncError && <div className="hunt-sync-error" role="status"><span>{syncError}</span><button onClick={onRefresh}>Tentar novamente</button></div>}
    {message && <p className="hunt-published" role="status"><Check size={14}/>{message}</p>}
    {draft && <div className="hunt-editor" id="hunt-editor" ref={panel} role="region" aria-labelledby="hunt-editor-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <div className="hunt-editor-heading"><div><span className="hunt-eyebrow">ADMINISTRAÇÃO</span><h2 id="hunt-editor-title">O tempo deste mundo.</h2></div><button className="icon-button" aria-label="Fechar controle do período" disabled={publishing} onClick={close}><X size={18}/></button></div>
      <form onSubmit={submit}>
        <fieldset disabled={publishing}>
          <label htmlFor="hunt-day">Número do dia</label><input id="hunt-day" type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" required value={draft.day} onChange={event => setDraft({ ...draft, day: event.target.value })}/>
          <fieldset className="hunt-period-options"><legend>Período do dia</legend>{huntPeriods.map(period => <label key={period.id} className={draft.period === period.id ? 'is-selected' : ''}><input type="radio" name="hunt-period" value={period.id} checked={draft.period === period.id} onChange={() => setDraft({ ...draft, period: period.id })}/>{periodIcon(period.id, 19)}<span>{period.label}</span></label>)}</fieldset>
          <fieldset className="hunt-identity"><legend>Cabeçalho do mapa</legend>
            <label htmlFor="hunt-label">Título do indicador</label><input id="hunt-label" type="text" required maxLength={60} value={draft.header.label} onChange={event=>setDraft({...draft,header:{...draft.header,label:event.target.value}})} placeholder="Ex.: Calendário de Exandria"/>
            <label htmlFor="hunt-day-label">Nome da contagem</label><input id="hunt-day-label" type="text" required maxLength={24} value={draft.header.dayLabel} onChange={event=>setDraft({...draft,header:{...draft.header,dayLabel:event.target.value}})} placeholder="Dia, Noite, Jornada…"/>
            <label htmlFor="hunt-date">Data personalizada <small>Opcional. Substitui a contagem no cabeçalho, mantendo o período abaixo. Deixe vazia para mostrar o número do dia.</small></label><input id="hunt-date" type="text" maxLength={80} value={draft.header.dateText} onChange={event=>setDraft({...draft,header:{...draft.header,dateText:event.target.value}})} placeholder="Ex.: 12 de Ches, 1492"/>
          </fieldset>
          <p className="hunt-approval-note">Após aprovar, peça aos jogadores para clicar em Atualizar mapa. A transição de névoa será usada se estiver ligada nos efeitos.</p>
          {state && state.revision !== draft.revision && <p className="form-error" role="alert">A configuração mudou. Feche, atualize o mapa e reabra este painel.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" type="submit" disabled={!valid || !draft.header.label.trim() || !draft.header.dayLabel.trim() || state?.revision !== draft.revision}><Check size={16}/>{publishing ? 'Publicando…' : 'Aprovar e atualizar'}</button>
          <button className="hunt-cancel" type="button" onClick={close}>Cancelar</button>
        </fieldset>
      </form>
    </div>}
  </div>;
}
