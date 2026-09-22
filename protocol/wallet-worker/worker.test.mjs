import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal } from './journal.mjs';
import { advancePayment, makePlan, tick } from './engine.mjs';

const wallet='11111111111111111111111111111111';
const wallet2='So11111111111111111111111111111111111111112';
const rewards={epochId:10,calculationHash:'a'.repeat(64),ruleVersion:'test',allocations:[{wallet,points:1},{wallet:wallet2,points:2}]};
function fixture(t) {
  const path=mkdtempSync(join(tmpdir(),'muse-wallet-test-'));
  let journal=openJournal(path,{test:true});
  t.after(()=>{journal.close();rmSync(path,{recursive:true,force:true});});
  return {path,get journal(){return journal;},reopen(){journal.close();journal=openJournal(path,{test:true});return journal;}};
}
function chain() {
  const calls={prepared:0,sent:0};
  return {calls,balance:async()=>'101',validateRecipients:async()=>{},
    planBatches:async payouts=>[{index:-1,payouts}],
    prepare:async()=>{calls.prepared++;return {signature:'sig',raw:'same-signed-bytes',lastValidBlockHeight:100};},
    prepareBatch:async payouts=>{assert.equal(payouts.length,2);calls.prepared++;return {signature:'sig',raw:'same-signed-bytes',lastValidBlockHeight:100};},
    status:async()=>null,height:async()=>50,broadcast:async(raw)=>{assert.equal(raw,'same-signed-bytes');calls.sent++;}};
}
test('all units allocated exactly, duplicate/self/unsafe scores rejected',()=>{
  const plan=makePlan(10,'101',rewards,'treasury');
  assert.equal(plan.payouts.reduce((n,p)=>n+BigInt(p.amountRewardUnits),0n),101n);
  assert.throws(()=>makePlan(10,'101',rewards,wallet));
  assert.throws(()=>makePlan(11,'101',rewards,'treasury'));
  assert.throws(()=>makePlan(10,'101',{...rewards,allocations:[{wallet,points:Infinity}]},'treasury'));
  assert.throws(()=>makePlan(10,'101',{...rewards,allocations:[{wallet,points:1},{wallet,points:2}]},'treasury'));
});
test('signed before broadcast; restart rebroadcasts identical bytes without signing again',async t=>{
  const f=fixture(t),c=chain(),p={index:0};
  c.broadcast=async()=>{assert.ok(f.journal.attempt(10,0));throw new Error('network timeout after accepted');};
  await assert.rejects(advancePayment(f.journal,c,10,p));
  f.reopen();c.broadcast=async raw=>assert.equal(raw,'same-signed-bytes');
  assert.equal(await advancePayment(f.journal,c,10,p),false);
  assert.equal(c.calls.prepared,1);
  c.status=async()=>({confirmationStatus:'finalized',err:null});
  assert.equal(await advancePayment(f.journal,c,10,p),true);
  assert.equal(await advancePayment(f.journal,c,10,p),true);
  assert.equal(c.calls.prepared,1);
});
test('uncertain expired transaction and finalized failure never create replacement',async t=>{
  const {journal}=fixture(t),c=chain();
  await advancePayment(journal,c,10,{index:0});
  c.height=async()=>101;
  await assert.rejects(advancePayment(journal,c,10,{index:0}),/unknown outcome/);
  c.status=async()=>({confirmationStatus:'finalized',err:{InstructionError:[1,'error']}});
  await assert.rejects(advancePayment(journal,c,10,{index:0}),/failed/);
  assert.equal(c.calls.prepared,1);assert.equal(c.calls.sent,1);
});
test('confirmed/fork error is not finalized and is not replaced',async t=>{
  const {journal}=fixture(t),c=chain();
  c.status=async()=>({confirmationStatus:'confirmed',err:{error:true}});
  assert.equal(await advancePayment(journal,c,10,{index:0}),false);
  assert.equal(c.calls.sent,0);
});
test('exclusive lock rejects a second process; journal identity is pinned',t=>{
  const f=fixture(t);
  assert.throws(()=>openJournal(f.path,{test:true}),/EEXIST/);
});
test('dry run never signs, scores, reports, or seals a round',async t=>{
  const {journal}=fixture(t),c=chain();
  const site={clock:async()=>({customSchedule:true,latestClosedEpoch:10}),rewards:async()=>rewards,
    score:async()=>assert.fail('score'),report:async()=>assert.fail('report')};
  const result=await tick({journal,site,chain:c,startEpoch:10,live:false,treasury:'treasury'});
  assert.equal(result.status,'dry_run');assert.equal(c.calls.prepared,0);assert.equal(journal.pending(),undefined);
});
test('failed report retries reporting only; changed scores never rewrite sealed payments',async t=>{
  const f=fixture(t),c=chain();let reports=0,reads=0;
  c.status=async()=>({confirmationStatus:'finalized',err:null});
  const site={clock:async()=>({customSchedule:true,latestClosedEpoch:10}),score:async()=>{},
    rewards:async()=>{reads++;return rewards;},report:async body=>{assert.equal(new Set(body.payouts.map(p=>p.txHash)).size,1);reports++;if(reports===1)throw new Error('unavailable');}};
  const args={journal:f.journal,site,chain:c,startEpoch:10,live:true,treasury:'treasury'};
  await assert.rejects(tick(args));
  args.journal=f.reopen();
  assert.equal((await tick(args)).status,'settled');
  assert.equal(c.calls.prepared,1);assert.equal(reads,1);assert.equal(reports,2);
  assert.equal(args.journal.next(10),11);
});
test('unfunded and open rounds do not consume an epoch',async t=>{
  const {journal}=fixture(t),c=chain();c.balance=async()=>'0';
  const site={clock:async()=>({customSchedule:true,latestClosedEpoch:9}),score:async()=>{},rewards:async()=>rewards};
  const args={journal,site,chain:c,startEpoch:10,live:true,treasury:'treasury'};
  assert.equal((await tick(args)).status,'waiting');
  site.clock=async()=>({customSchedule:true,latestClosedEpoch:10});
  assert.equal((await tick(args)).status,'unfunded');assert.equal(journal.next(10),10);
});

test('legacy pending round keeps per-recipient attempts across upgrade',async t=>{
  const {journal}=fixture(t),c=chain();
  journal.insert({epochId:10,manifest:makePlan(10,'101',rewards,'treasury'),complete:false});
  c.prepareBatch=async()=>assert.fail('legacy round must not be batched');
  c.status=async()=>({confirmationStatus:'finalized',err:null});
  const result=await tick({journal,site:{report:async()=>{}},chain:c,startEpoch:10,live:true,treasury:'treasury'});
  assert.equal(result.status,'settled');assert.equal(c.calls.prepared,2);
});

test('batch restart rebroadcasts same signed bytes for entire round',async t=>{
  const f=fixture(t),c=chain();
  const site={clock:async()=>({customSchedule:true,latestClosedEpoch:10}),score:async()=>{},rewards:async()=>rewards,report:async()=>{}};
  const args={journal:f.journal,site,chain:c,startEpoch:10,live:true,treasury:'treasury'};
  await tick(args);assert.ok(f.journal.attempt(10,-1));
  args.journal=f.reopen();await tick(args);
  assert.equal(c.calls.prepared,1);assert.equal(c.calls.sent,2);
  c.status=async()=>({confirmationStatus:'finalized',err:null});
  assert.equal((await tick(args)).status,'settled');assert.equal(c.calls.prepared,1);
});

test('multiple batches resume after partial completion and report correct shared signatures',async t=>{
  const f=fixture(t),c=chain();let report;
  c.planBatches=async payouts=>payouts.map((p,i)=>({index:-1-i,payouts:[p]}));
  c.prepareBatch=async()=>({signature:'sig'+(++c.calls.prepared),raw:'same-signed-bytes',lastValidBlockHeight:100});
  c.status=async sig=>sig==='sig1'?{confirmationStatus:'finalized',err:null}:null;
  const site={clock:async()=>({customSchedule:true,latestClosedEpoch:10}),score:async()=>{},rewards:async()=>rewards,report:async body=>{report=body;}};
  const args={journal:f.journal,site,chain:c,startEpoch:10,live:true,treasury:'treasury'};
  assert.equal((await tick(args)).status,'confirming');assert.equal(report,undefined);
  assert.equal(f.journal.attempt(10,-1).finalized,true);
  args.journal=f.reopen();
  c.planBatches=async()=>assert.fail('never regroup sealed batches');
  c.status=async()=>({confirmationStatus:'finalized',err:null});
  assert.equal((await tick(args)).status,'settled');
  assert.equal(c.calls.prepared,2);
  assert.deepEqual(report.payouts.map(p=>p.txHash),['sig1','sig2']);
});
