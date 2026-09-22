import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// An exclusive process lock deliberately survives crashes. Never auto-steal it:
// another host/process may still be signing with the same treasury.
export function openJournal(directory, identity) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'worker.lock');
  const descriptor = openSync(lock, 'wx', 0o600);
  let db;
  try {
    db = new DatabaseSync(join(directory, 'payouts.sqlite'));
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rounds (epoch INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (epoch INTEGER NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(epoch,idx));`);
    const encoded = JSON.stringify(identity);
    const existing = db.prepare('SELECT identity FROM settings WHERE id=1').get();
    if (existing && existing.identity !== encoded) throw new Error('Journal identity mismatch; do not reuse payment history for another configuration');
    db.prepare('INSERT OR IGNORE INTO settings VALUES (1,?)').run(encoded);
  } catch (error) {
    db?.close(); closeSync(descriptor); unlinkSync(lock); throw error;
  }
  return {
    pending() {
      return db.prepare('SELECT data FROM rounds ORDER BY epoch').all()
        .map(row => JSON.parse(row.data)).find(row => !row.complete);
    },
    next(start) {
      const last = db.prepare('SELECT MAX(epoch) AS epoch FROM rounds').get().epoch;
      return last === null ? start : last + 1;
    },
    insert(round) { db.prepare('INSERT INTO rounds VALUES (?,?)').run(round.epochId, JSON.stringify(round)); },
    save(round) { db.prepare('UPDATE rounds SET data=? WHERE epoch=?').run(JSON.stringify(round), round.epochId); },
    attempt(epoch, index) {
      const row = db.prepare('SELECT data FROM attempts WHERE epoch=? AND idx=?').get(epoch,index);
      return row ? JSON.parse(row.data) : null;
    },
    seal(epoch, index, attempt) {
      db.prepare('INSERT INTO attempts VALUES (?,?,?)').run(epoch,index,JSON.stringify(attempt));
    },
    finalize(epoch, index) {
      const row = this.attempt(epoch,index);
      if (!row) throw new Error('Missing signed attempt');
      db.prepare('UPDATE attempts SET data=? WHERE epoch=? AND idx=?').run(JSON.stringify({...row, finalized:true}),epoch,index);
    },
    close() { db.close(); closeSync(descriptor); unlinkSync(lock); },
  };
}
