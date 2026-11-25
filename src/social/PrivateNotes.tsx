import { useState } from 'react';
import { LockKeyhole, Save } from 'lucide-react';
import { SocialDialog } from './SocialEditors';
import type { PrivateNote, SocialCharacter } from './types';

export default function PrivateNotes({owner,target,note,editable,onClose,onSave}:{owner:SocialCharacter;target:SocialCharacter;note?:PrivateNote;editable:boolean;onClose:()=>void;onSave:(value:{actorId:string;targetId:string;text:string;revision:number})=>Promise<void>}){
  const [text,setText]=useState(note?.text||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await onSave({actorId:owner.id,targetId:target.id,text,revision:note?.revision||0});onClose();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  return <SocialDialog title={`Anotações sobre ${target.name}`} onClose={onClose} busy={busy}><p className="social-note-privacy"><LockKeyhole size={16}/>Visível somente para {owner.name} e o Mestre.</p>{editable?<form onSubmit={save}><label className="social-note-field">Meu caderno<textarea rows={8} maxLength={4000} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="Impressões, segredos, suspeitas… o que você quer lembrar?"/></label><small className="social-hint">{text.length}/4000 · Para apagar a anotação, deixe o campo vazio e salve.</small>{error&&<p className="social-error" role="alert">{error}</p>}<footer><button type="button" className="social-button quiet" disabled={busy} onClick={onClose}>Cancelar</button><button className="social-button primary" disabled={busy}><Save size={16}/>{busy?'Salvando…':'Salvar anotação'}</button></footer></form>:<div className="social-note-paper"><p className="social-prose">{note?.text||'Este jogador ainda não escreveu uma anotação sobre este personagem.'}</p></div>}</SocialDialog>;
}
