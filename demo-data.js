/* Deterministic demo tournament. Existing records and user edits are preserved. */
(function (root) {
  'use strict';
  const venues = [
    { venue: '主場館', court: 'A1' },
    { venue: '主場館', court: '中央球場' },
    { venue: '副場館', court: '東側球場' },
    { venue: '副場館', court: 'B2' },
  ];
  function todayDate(now = new Date()) {
    return new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  }
  function offsetDate(date, days) {
    const time = new Date(date + 'T12:00:00+08:00');
    time.setUTCDate(time.getUTCDate() + days);
    return todayDate(time);
  }
  function eventPhase(event, matches, now = new Date()) {
    const today = todayDate(now),
      canEnroll = event.registrationOpen && event.deadline >= today;
    if (matches.some((m) => m.eventId === event.id && m.date === today && m.status === 'started'))
      return { key: 'live', label: 'LIVE · 進行中', canEnroll };
    if (event.date > today && event.date <= offsetDate(today, 30))
      return { key: 'upcoming', label: '即將開始', canEnroll };
    if (canEnroll) return { key: 'open', label: '報名中', canEnroll };
    return {
      key: event.date > today ? 'scheduled' : 'closed',
      label: event.date > today ? '尚未開始' : '報名已截止',
      canEnroll,
    };
  }
  function applyScenario(db) {
    const today = todayDate();
    if (db.homeScenarioVersion === 1 && db.homeScenarioDate === today) return false;
    const first = !db.homeScenarioVersion;
    for (const [eid, days, deadlineDays] of [
      ['badminton', 0, -1],
      ['volleyball', 21, 14],
      ['tennis', 60, 45],
    ]) {
      const e = db.events.find((e) => e.id === eid);
      if (!e) continue;
      const previous = e.date;
      e.date = offsetDate(today, days);
      e.deadline = offsetDate(today, deadlineDays);
      for (const m of db.matches.filter((m) => m.eventId === eid && m.date === previous))
        m.date = e.date;
      if (first) {
        e.registrationOpen = eid !== 'badminton';
        if (eid === 'badminton') e.scheduled = true;
      }
    }
    db.homeScenarioVersion = 1;
    db.homeScenarioDate = today;
    return true;
  }
  function streamUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value).trim());
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : '';
    } catch {
      return '';
    }
  }
  function normalize(db) {
    for (const e of db.events) {
      if (e.streamUrl === undefined)
        e.streamUrl = e.id === 'badminton' ? 'https://www.youtube.com/' : '';
      if (!Array.isArray(e.locations) || !e.locations.length)
        e.locations = Array.from({ length: e.courts || 1 }, (_, i) => ({
          venue: e.location || '主場館',
          court: String(i + 1),
        }));
    }
    for (const m of db.matches) {
      const e = db.events.find((e) => e.id === m.eventId);
      m.venue ??= e?.location || '主場館';
      m.court = String(m.court);
      m.gamesA ??= 0;
      m.gamesB ??= 0;
      m.gameHistory ??= [];
    }
  }
  function upgrade(db) {
    normalize(db);
    const scenarioChanged = applyScenario(db);
    if (db.demoVersion >= 2) return scenarioChanged;
    const e = db.events.find((e) => e.id === 'badminton');
    if (e) {
      e.groups = [...new Set([...e.groups, '男子單打', '女子單打', '混合雙打'])];
      e.locations = venues.map((v) => ({ ...v }));
      e.courts = 4;
      const surnames = [
        '陳',
        '林',
        '黃',
        '張',
        '李',
        '王',
        '吳',
        '劉',
        '蔡',
        '楊',
        '許',
        '鄭',
        '謝',
        '洪',
        '郭',
        '曾',
      ];
      for (let g = 0; g < 3; g++) {
        const group = ['男子單打', '女子單打', '混合雙打'][g],
          entryIds = [];
        for (let i = 0; i < 16; i++) {
          const eid = g === 0 && i < 2 ? ['entry-a', 'entry-b'][i] : 'demo-entry-' + g + '-' + i;
          entryIds.push(eid);
          if (db.entries.some((r) => r.id === eid)) continue;
          const name = surnames[i] + ['子安', '佳蓉', '承恩'][g] + String(i + 1).padStart(2, '0');
          const uid = 'demo-athlete-' + g + '-' + i;
          if (!db.users.some((u) => u.id === uid))
            db.users.push({
              id: uid,
              email: uid + '@example.test',
              name,
              admin: false,
              demo: true,
              canLogin: false,
              hash: '',
              salt: '',
              phone: '09' + String(10000000 + g * 100 + i),
              birthday: '2000-01-01',
              gender: '不透露',
              address: '',
              emergencyName: '示範聯絡人',
              emergencyPhone: '0912345678',
              level: '',
              photo: '',
            });
          db.entries.push({
            id: eid,
            eventId: e.id,
            userId: uid,
            group,
            team: g === 2 ? name + ' / ' + surnames[(i + 5) % 16] + '羽晴' : name,
            status: 'approved',
            demo: true,
          });
        }
        const roundSizes = [8, 4, 2, 1],
          roundLabels = ['16 強', '8 強', '準決賽', '決賽'];
        const mid = (r, i) =>
          g === 0 && r === 0 && i === 0 ? 'match-a' : 'demo-match-' + g + '-' + r + '-' + i;
        for (let r = 0; r < 4; r++)
          for (let i = 0; i < roundSizes[r]; i++) {
            const matchId = mid(r, i),
              nextMatchId = r < 3 ? mid(r + 1, Math.floor(i / 2)) : '';
            const start = new Date(e.date + 'T09:00:00+08:00');
            start.setMinutes(
              start.getMinutes() + (g * 5 + [0, 2, 3, 4][r] + Math.floor(i / 4)) * 40,
            );
            const time = new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Asia/Taipei',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }).format(start);
            const old = db.matches.find((m) => m.id === matchId);
            if (old) {
              old.nextMatchId = nextMatchId;
              old.nextSlot = i % 2 ? 'B' : 'A';
              old.roundLabel = roundLabels[r];
              old.bracket = true;
              if (old.demo && old.revision === 0) old.time = time;
              continue;
            }
            const a = r === 0 ? db.entries.find((x) => x.id === entryIds[i * 2]) : null;
            const b = r === 0 ? db.entries.find((x) => x.id === entryIds[i * 2 + 1]) : null;
            const place = venues[(g * 8 + i) % venues.length];
            const finished = r === 0 && i === 1;
            db.matches.push({
              id: matchId,
              eventId: e.id,
              group,
              roundLabel: roundLabels[r],
              bracket: true,
              teamA: a?.team || '前輪場次勝方',
              teamB: b?.team || '前輪場次勝方',
              entryA: a?.id || null,
              entryB: b?.id || null,
              date: e.date,
              time,
              venue: place.venue,
              court: place.court,
              refereeId: '',
              status: finished
                ? 'finished'
                : r === 0 && i === 2
                  ? 'started'
                  : r === 0 && i === 3
                    ? 'delayed'
                    : 'pending',
              scoreA: finished ? 21 : r === 0 && i === 2 ? 18 : 0,
              scoreB: finished ? 18 : r === 0 && i === 2 ? 20 : 0,
              gamesA: finished ? 2 : 0,
              gamesB: finished ? 1 : r === 0 && i === 2 ? 1 : 0,
              gameHistory: finished
                ? [
                    { scoreA: 21, scoreB: 16 },
                    { scoreA: 17, scoreB: 21 },
                    { scoreA: 21, scoreB: 18 },
                  ]
                : [],
              checkedA: finished || (r === 0 && i === 2),
              checkedB: finished || (r === 0 && i === 2),
              locked: finished,
              revision: 0,
              nextMatchId,
              nextSlot: i % 2 ? 'B' : 'A',
              demo: true,
            });
          }
        // Show known qualifiers and identify each feeder for the remaining slots.
        for (let r = 0; r < 3; r++)
          for (let i = 0; i < roundSizes[r]; i++) {
            const from = db.matches.find((m) => m.id === mid(r, i)),
              next = db.matches.find((m) => m.id === from.nextMatchId),
              side = from.nextSlot;
            if (from.locked && !next['entry' + side]) {
              const winner =
                from.gamesA !== from.gamesB
                  ? from.gamesA > from.gamesB
                    ? 'A'
                    : 'B'
                  : from.scoreA > from.scoreB
                    ? 'A'
                    : 'B';
              next['team' + side] = from['team' + winner];
              next['entry' + side] = from['entry' + winner];
            } else if (!next['entry' + side])
              next['team' + side] = roundLabels[r] + '第 ' + (i + 1) + ' 場勝方';
          }
      }
    }
    // Other two events stay open for the enrollment demo, with realistic participant records.
    for (const [eid, count] of [
      ['volleyball', 6],
      ['tennis', 8],
    ]) {
      const event = db.events.find((e) => e.id === eid);
      if (!event) continue;
      for (let i = 0; i < count; i++) {
        const rid = 'demo-' + eid + '-entry-' + i;
        if (db.entries.some((r) => r.id === rid)) continue;
        const uid = 'demo-' + eid + '-user-' + i,
          name = (eid === 'volleyball' ? '大學排球隊 ' : '網球選手 ') + (i + 1);
        db.users.push({
          id: uid,
          email: uid + '@example.test',
          name,
          admin: false,
          demo: true,
          canLogin: false,
          hash: '',
          salt: '',
          phone: '0912345678',
          birthday: '2000-01-01',
          emergencyName: '示範聯絡人',
          emergencyPhone: '0987654321',
        });
        db.entries.push({
          id: rid,
          eventId: eid,
          userId: uid,
          group: event.groups[i % event.groups.length],
          team: name,
          status: i % 3 === 0 ? 'pending' : 'approved',
          demo: true,
        });
      }
    }
    db.demoVersion = 2;
    normalize(db);
    return true;
  }
  const api = { normalize, upgrade, todayDate, offsetDate, eventPhase, streamUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlueCourtDemo = api;
})(globalThis);
