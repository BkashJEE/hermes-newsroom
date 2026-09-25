"""Read dated user/assistant evidence from Hermes databases, never tool or system logs."""
import argparse
import datetime as dt
import json
import re
import sqlite3
from pathlib import Path
from zoneinfo import ZoneInfo


def clean(value, limit):
    text = str(value or '')
    text = re.sub(r'(?i)\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{15,}|Bearer\s+\S+)', '[redacted]', text)
    text = re.sub(r'(?im)^.*(?:api[_ -]?key|password|secret|access[_ -]?token)\s*[:=].*$', '[redacted credential line]', text)
    return text[:limit]


def collect(root, date, timezone):
    zone = ZoneInfo(timezone)
    day = dt.date.fromisoformat(date)
    start = dt.datetime.combine(day, dt.time(), zone).timestamp()
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), zone).timestamp()
    profiles = [('default', root)]
    if (root / 'profiles').is_dir():
        profiles += [(p.name, p) for p in sorted((root / 'profiles').iterdir())
                     if p.is_dir() and not p.is_symlink() and not p.name.startswith('.')]
    records, coverage = [], []
    for name, directory in profiles:
        db = directory / 'state.db'
        report = {'profile': name, 'state': 'missing', 'sessions': 0, 'omitted': 0}
        coverage.append(report)
        if not db.is_file():
            continue
        try:
            with sqlite3.connect(db.as_uri() + '?mode=ro', uri=True, timeout=2) as con:
                con.row_factory = sqlite3.Row
                cols = {r[1] for r in con.execute('pragma table_info(sessions)')}
                mcols = {r[1] for r in con.execute('pragma table_info(messages)')}
                hidden = 'and coalesce(s.hidden,0)=0' if 'hidden' in cols else ''
                active = 'and coalesce(m.active,1)=1' if 'active' in mcols else ''
                rows = con.execute(f'''select s.id, s.title, s.source,
                    min(m.timestamp) first_at, max(m.timestamp) last_at, count(*) messages
                    from sessions s join messages m on m.session_id=s.id
                    where m.timestamp>=? and m.timestamp<? and m.role in ('user','assistant')
                    {hidden} {active} group by s.id order by last_at desc''', (start, end)).fetchall()
                eligible = []
                for row in rows:
                    excerpts = {}
                    for role, order, limit in [('user', 'asc', 1000), ('assistant', 'desc', 2400)]:
                        msg = con.execute(f'''select substr(m.content,1,12000) content from messages m
                            where m.session_id=? and m.role=? and m.timestamp>=? and m.timestamp<?
                            {active} and m.content is not null order by m.timestamp {order}, m.id {order} limit 1''',
                            (row['id'], role, start, end)).fetchone()
                        excerpts[role] = clean(msg['content'] if msg else '', limit)
                    if 'newsroom_personal_daily' in excerpts['user']:
                        continue
                    eligible.append({
                        'profile': name, 'sessionId': row['id'], 'title': clean(row['title'] or 'Untitled Hermes session', 180),
                        'source': clean(row['source'], 60), 'messages': row['messages'],
                        'firstAt': dt.datetime.fromtimestamp(row['first_at'], dt.timezone.utc).isoformat(),
                        'lastAt': dt.datetime.fromtimestamp(row['last_at'], dt.timezone.utc).isoformat(),
                        'request': excerpts['user'], 'response': excerpts['assistant'],
                    })
                report.update(state='ok', sessions=len(eligible), omitted=max(0, len(eligible)-40))
                records.extend(eligible[:40])
        except (sqlite3.Error, OSError):
            report['state'] = 'unavailable'
    records.sort(key=lambda r: (r['profile'], r['lastAt'], r['sessionId']))
    for i, record in enumerate(records):
        record['id'] = f'S{i+1}'
    return {'date': date, 'timezone': timezone, 'records': records, 'coverage': coverage,
            'collectedAt': dt.datetime.now(dt.timezone.utc).isoformat()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('date')
    parser.add_argument('timezone')
    args = parser.parse_args()
    print(json.dumps(collect(Path.home() / '.hermes', args.date, args.timezone)))
