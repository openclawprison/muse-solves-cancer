import test from 'node:test';
import assert from 'node:assert/strict';
import { researchRewards } from './research-reward-policy.ts';
test('every wallet with useful accepted work can earn; volume does not stack', () => {
 const rows=[{id:'a',wallet:'A',workType:'screening'},{id:'b',wallet:'B',workType:'screening'},{id:'c',wallet:'A',workType:'screening'}];
 const scores=rows.map((r,i)=>({...r,total:[1,100,30][i],duplicateRisk:false,safetyConcern:false}));
 assert.deepEqual(researchRewards(rows,scores).map(x=>[x.wallet,x.points]),[['A',6],['B',20]]);
});
test('duplicates, unsafe, zero and invalid scores are excluded', () => {
 const row={id:'a',wallet:'A',workType:'screening'};
 for(const change of [{duplicateRisk:true},{safetyConcern:true},{total:0},{total:101},{total:NaN}])
 assert.equal(researchRewards([row],[{id:'a',total:10,duplicateRisk:false,safetyConcern:false,...change}]).length,0);
});
test('category contributions combine, ties resolve deterministically', () => {
 const rows=[{id:'b',wallet:'A',workType:'screening'},{id:'a',wallet:'A',workType:'screening'},{id:'c',wallet:'A',workType:'extraction'}];
 const scores=rows.map(r=>({id:r.id,total:1,duplicateRisk:false,safetyConcern:false}));
 const result=researchRewards(rows,scores);
 assert.equal(result.length,2);assert.equal(result.reduce((s,r)=>s+r.points,0),10);
 assert.deepEqual(result,researchRewards([...rows].reverse(),[...scores].reverse()));
});
