export const wageTaskLabel=(task,meta)=>meta?.taskDescriptions?.[task]?`${meta.taskDescriptions[task]} · ${task}`:task;
export const wageActivityLabel=(task,activity,meta)=>`${wageTaskLabel(task,meta)} · ${activity}`;
