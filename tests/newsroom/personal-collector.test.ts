import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("collects only active dated conversational evidence, including sessions begun earlier, without changing databases", () => {
  const output = execFileSync(
    "python3",
    [
      "-c",
      `
import importlib.util, sqlite3, tempfile, pathlib, datetime, hashlib, sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('collector','scripts/collect-hermes-work.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 root=pathlib.Path(tmp); db=root/'state.db'
 c=sqlite3.connect(db)
 c.executescript('CREATE TABLE sessions(id TEXT,title TEXT,source TEXT,hidden INTEGER); CREATE TABLE messages(id INTEGER, session_id TEXT, role TEXT, content TEXT,timestamp REAL,active INTEGER);')
 c.executemany('INSERT INTO sessions VALUES(?,?,?,?)',[('visible','Synthetic task','cli',0),('hidden','Private hidden','cli',1)])
 stamp=lambda value: datetime.datetime.fromisoformat(value).timestamp()
 c.executemany('INSERT INTO messages VALUES(?,?,?,?,?,?)',[
 (1,'visible','user','Previous day','2026-09-21T06:59:00+00:00',1),
 (2,'visible','user','Please inspect synthetic task','2026-09-21T07:00:00+00:00',1),
 (3,'visible','assistant','Reported synthetic result','2026-09-22T06:59:00+00:00',1),
 (4,'visible','tool','Never include tool output','2026-09-21T08:00:00+00:00',1),
 (5,'visible','assistant','Inactive message','2026-09-21T09:00:00+00:00',0),
 (6,'hidden','user','Never include hidden session','2026-09-21T08:00:00+00:00',1),
 (7,'visible','assistant','Following day','2026-09-22T07:00:00+00:00',1)])
 for row in c.execute('select id,timestamp from messages').fetchall(): c.execute('update messages set timestamp=? where id=?',(stamp(row[1]),row[0]))
 c.commit();c.close()
 before=hashlib.sha256(db.read_bytes()).hexdigest()
 result=m.collect(root,'2026-09-21','US/Pacific')
 assert len(result['records'])==1
 r=result['records'][0]
 assert r['messages']==2 and r['request']=='Please inspect synthetic task' and r['response']=='Reported synthetic result'
 assert hashlib.sha256(db.read_bytes()).hexdigest()==before
 assert not m.collect(root,'2026-09-20','UTC')['records']
 print('ok')
`,
    ],
    { encoding: "utf8" },
  );
  expect(output.trim()).toBe("ok");
});
