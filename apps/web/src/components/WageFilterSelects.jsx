import ScrollSelect from './ScrollSelect';
import {wageTaskLabel,wageActivityLabel} from '../wage-labels';
export default function WageFilterSelects({meta,task,activity,disabled,onChange}){
 const activities=meta?.activityOptions||(meta?.activities||[]).map(a=>({task,activity:a}));
 return <><label>Task<ScrollSelect searchable aria-label="Wage task" value={task} disabled={disabled} onChange={e=>onChange({task:e.target.value,activity:''})}><option value="">All tasks</option>{task&&!(meta?.tasks||[]).includes(task)&&<option value={task}>{wageTaskLabel(task,meta)}</option>}{(meta?.tasks||[]).map(t=><option value={t} key={t}>{wageTaskLabel(t,meta)}</option>)}</ScrollSelect></label>
 <label>Activity<ScrollSelect searchable aria-label="Wage activity" value={activity?JSON.stringify([task,activity]):''} disabled={disabled} onChange={e=>{if(!e.target.value){onChange({task,activity:''});return;}const [nextTask,nextActivity]=JSON.parse(e.target.value);onChange({task:nextTask,activity:nextActivity});}}><option value="">All activities</option>{activities.map(a=><option key={JSON.stringify([a.task,a.activity])} value={JSON.stringify([a.task,a.activity])}>{wageActivityLabel(a.task,a.activity,meta)}</option>)}</ScrollSelect></label></>;
}
