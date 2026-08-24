export type RuntimeMode='STOPPED'|'DRY_RUN'|'ARMED'|'LIVE'|'EMERGENCY_STOP';
let mode:RuntimeMode='STOPPED';
export function getRuntimeMode(){return mode;}
export function transition(next:RuntimeMode,authorized=false){
 const allowed:Record<RuntimeMode,RuntimeMode[]>={STOPPED:['DRY_RUN'],DRY_RUN:['STOPPED','ARMED'],ARMED:['DRY_RUN','LIVE'],LIVE:['EMERGENCY_STOP','ARMED'],EMERGENCY_STOP:['STOPPED']};
 if(!allowed[mode].includes(next)) throw new Error(`INVALID_TRANSITION:${mode}->${next}`);
 if((next==='ARMED'||next==='LIVE'||next==='STOPPED')&&!authorized&&next!=='STOPPED') throw new Error('AUTHORIZATION_REQUIRED');
 mode=next; return mode;
}
