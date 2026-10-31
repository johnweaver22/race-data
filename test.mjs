import assert from 'node:assert/strict';
import {sequence,compute} from './engine.mjs';
let count=0;
for(const pool of [25,50]) for(const distance of [50,100,200,400,800,1500]) for(const stroke of ['Freestyle','Backstroke','Breaststroke','Butterfly','IM']){
 try{
  const config={pool,distance,stroke}, events=sequence(config);
  assert.equal(events.length,4*(distance/pool)+2);
  assert.equal(events[0].type,'GO'); assert.equal(events.at(-1).type,'FINISH');
  assert.equal(events.filter(e=>e.type==='SR_START').length,distance/pool);
  assert.equal(events.filter(e=>e.type==='SR_STOP').length,distance/pool);
  const t=events.map((_,i)=>i*2);
  const result=compute(config,t);
  assert.equal(result.lengths.length,distance/pool);
  assert.equal(result.lengths[0].estimatedDPS,null);
  count++;
 }catch(e){if(e.message==='Unsupported IM event')continue;throw e;}
}
console.log(`Passed ${count} event configurations`);
