import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { scoreInBatches, validateScores, reconcileExactCopies } from '../lib/batch-scoring.mjs';
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0010_parallel_preak.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));sql.exec('CREATE TABLE scoring_job_failures(response_id TEXT PRIMARY KEY,epoch_id INTEGER,payload_json TEXT,reason TEXT,created_at INTEGER)');const db={prepare(query){let args=[];return{bind(...a){args=a;return this;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){return {meta:sql.prepare(query).run(...args)};}};},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};return{db,sql};}
const row=i=>({id:'id-'+i,wallet:'wallet-'+i,title:'Study '+i,abstract:'Distinct evidence contribution '+i,workType:'evidence-extraction',evidenceUrl:'https://example.org/'+i});
const score=id=>({id,rigor:20,reproducibility:20,novelty:5,evidence:10,collaboration:5,reason:'Useful checked evidence',duplicateRisk:false,safetyConcern:false});
const payload=rows=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({scores:rows.map(r=>score(r.id))})}]}]});

test('100 submissions: batches <=15, concurrency <=3, durable resume and full-coverage gate',async()=>{
  const {db,sql}=fixture(), rows=Array.from({length:100},(_,i)=>row(i));const jobs=new Map();let active=0,maxActive=0,creates=0;
  const fetcher=async(url,options)=>{active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setTimeout(r,2));let response;if(options.method==='POST'){const request=JSON.parse(options.body),batch=JSON.parse(request.input).submissions;assert.ok(batch.length<=15);const id='resp_'+(++creates);jobs.set(id,batch);response={id,status:'queued'};}else{const id=url.split('/').pop();response={id,...payload(jobs.get(id))};}active--;return{ok:true,status:200,json:async()=>response};};
  let result,now=1000;for(let i=0;i<12;i++){result=await scoreInBatches({db,rows,epochId:5,model:'test',apiKey:'mock',fetcher,now});if(result.status==='complete')break;assert.equal(result.scores,undefined,'partial batches never become a payout score set');now+=11000;}
  assert.equal(result.status,'complete');assert.equal(result.scores.length,100);assert.equal(creates,7);assert.equal(maxActive,3);
  const again=await scoreInBatches({db,rows,epochId:5,model:'test',apiKey:'mock',fetcher,now});assert.equal(again.scores.length,100);assert.equal(creates,7,'completed jobs are not reissued after resume');
  await assert.rejects(()=>scoreInBatches({db,rows:[...rows,row(101)],epochId:5,model:'test',apiKey:'mock',fetcher,now}),/input changed/);sql.close();
});
test('invalid results are archived and stop after three attempts without scores',async()=>{
  const {db,sql}=fixture();let n=0;const fetcher=async()=>({ok:true,status:200,json:async()=>({id:'resp_bad'+(++n),...payload([])})});let now=1000;
  for(let i=0;i<3;i++){const r=await scoreInBatches({db,rows:[row(1)],epochId:6,model:'test',apiKey:'mock',fetcher,now});assert.equal(r.status,'scoring');now+=16000;}
  await assert.rejects(()=>scoreInBatches({db,rows:[row(1)],epochId:6,model:'test',apiKey:'mock',fetcher,now}),/operator review/);assert.equal(sql.prepare('SELECT count(*) n FROM scoring_job_failures').get().n,3);sql.close();
});
test('429 retries back off without pretending a batch completed',async()=>{
  const {db,sql}=fixture();let calls=0;const fetcher=async()=>{calls++;return{ok:false,status:429,json:async()=>({})};};const args={db,rows:[row(1)],epochId:7,model:'test',apiKey:'mock',fetcher};
  assert.equal((await scoreInBatches({...args,now:1000})).status,'scoring');await scoreInBatches({...args,now:2000});assert.equal(calls,1);assert.equal(sql.prepare('SELECT failure_count FROM scoring_batches').get().failure_count,0);sql.close();
});
test('global exact-copy rejection and strict score validation',()=>{
  const rows=[row(1),{...row(2),abstract:row(1).abstract.toUpperCase()}];const result=reconcileExactCopies(rows,rows.map(r=>score(r.id)));assert.equal(result[0].duplicateRisk,false);assert.equal(result[1].duplicateRisk,true);assert.throws(()=>validateScores(payload([row(1),row(1)]),rows),/duplicate/);
});
