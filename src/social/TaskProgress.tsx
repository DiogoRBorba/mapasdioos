import { useState } from 'react';
import { CheckCheck, RotateCcw, X } from 'lucide-react';
import { SocialDialog } from './SocialEditors';
import { statusNames, taskNames, type Task } from './types';

type Change={taskId:string;revision:number;stepId?:string;done?:boolean;status?:'published'|'completed'|'failed'};
export default function TaskProgress({task,admin,onClose,onChange}:{task:Task;admin:boolean;onClose:()=>void;onChange:(value:Change)=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const steps=task.steps||[],done=steps.filter(step=>step.done).length,finished=['completed','failed','closed'].includes(task.status);
  async function change(patch:Omit<Change,'taskId'|'revision'>){if(busy)return;setBusy(true);setError('');try{await onChange({taskId:task.id,revision:task.revision,...patch});}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  return <SocialDialog title={task.title} onClose={onClose} busy={busy}>
    <div className="social-task-meta"><span className="social-chip">{taskNames[task.kind]}</span><span className={`social-task-status ${task.status}`}>{statusNames[task.status]}</span></div>
    <p className="social-prose">{task.description||'Sem instruções adicionais.'}</p>{task.due&&<p className="social-hint">{task.due}</p>}
    <section className="social-task-steps"><h3>Passos <span>{done}/{steps.length}</span></h3>
      {steps.length?<><progress aria-label="Passos completados" value={done} max={steps.length}/><ol>{steps.map((step,index)=><li key={step.id} className={step.done?'done':''}><label><input type="checkbox" checked={step.done} disabled={!admin||busy||finished} onChange={e=>void change({stepId:step.id,done:e.target.checked})}/><span><strong>Passo {index+1}{step.done?' · Completado':''}</strong><span className="social-prose">{step.description}</span></span></label></li>)}</ol></>:<p className="social-hint">Esta tarefa ainda não tem passos. O Mestre pode adicioná-los em Editar tarefa.</p>}
    </section>
    {error&&<p className="social-error" role="alert">{error}</p>}
    {admin?<><p className="social-hint">{finished?'Reabra a tarefa para continuar marcando passos.':done===steps.length&&steps.length?'Todos os passos estão feitos. Finalize quando quiser.':'Você pode finalizar a tarefa mesmo com passos pendentes.'}</p><footer className="social-task-resolution">{finished?<button className="social-button" disabled={busy} onClick={()=>void change({status:'published'})}><RotateCcw size={16}/>Reabrir tarefa</button>:<><button className="social-button danger" disabled={busy} onClick={()=>void change({status:'failed'})}><X size={16}/>Marcar como Fracassada</button><button className="social-button primary" disabled={busy} onClick={()=>void change({status:'completed'})}><CheckCheck size={17}/>Marcar como Completada</button></>}</footer></>:<p className="social-hint">O Mestre acompanha os passos e define o resultado para toda a mesa. Use Atualizar campanha para ver as alterações.</p>}
  </SocialDialog>;
}
