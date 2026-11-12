'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { CompetitionStore, SESSION } = require('../competition.js');
class MemoryStorage {
  constructor(data = []) {
    this.map = new Map(data);
  }
  getItem(k) {
    return this.map.get(k) ?? null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}
let seed;
before(async () => {
  const storage = new MemoryStorage();
  const app = new CompetitionStore(storage);
  await app.init();
  seed = [...storage.map];
});
function setup(uid = 'player') {
  const storage = new MemoryStorage(seed);
  storage.setItem(SESSION, uid);
  const app = new CompetitionStore(storage);
  app.load();
  return app;
}
test('registration always creates a player, ignores a requested privileged role and persists hashed credentials', async () => {
  const app = setup();
  const user = await app.register({
    email: 'NEW@example.com',
    name: 'New Player',
    password: 'safe-password',
    admin: true,
    role: 'admin',
  });
  assert.equal(app.role(), 'player');
  assert.equal(user.admin, false);
  assert.equal(user.email, 'new@example.com');
  assert(!JSON.stringify(user).includes('safe-password'));
  await assert.rejects(
    app.register({ email: user.email, name: 'Duplicate', password: 'safe-password' }),
    /已註冊/,
  );
});
test('credentials alone select the actual assigned interface without a role selection', async () => {
  const app = setup();
  await assert.rejects(app.login('player@bluecourt.tw', 'wrong-password'), /密碼錯誤/);
  for (const [mail, role] of [
    ['player@bluecourt.tw', 'player'],
    ['referee@bluecourt.tw', 'referee'],
    ['staff@bluecourt.tw', 'manager'],
    ['admin@bluecourt.tw', 'admin'],
  ]) {
    await app.login(mail, 'BlueCourt2026!');
    assert.equal(app.role(), role);
  }
});
test('manager only has access to their event and cannot grant system or manager privileges', () => {
  const app = setup('manager');
  assert.deepEqual(
    app.managedEvents().map((e) => e.id),
    ['badminton'],
  );
  assert.throws(() => app.closeRegistration('volleyball'), /沒有這場賽事/);
  assert.throws(() => app.assignManager('tennis', 'other@bluecourt.tw'), /只有系統管理員/);
  assert.throws(() => app.setAdmin('player', true), /只有系統管理員/);
  assert.throws(() => app.createEvent({}), /只有系統管理員/);
});
test('system admin can inspect every event and grant/revoke scoped manager access', () => {
  const app = setup('admin');
  assert.equal(app.managedEvents().length, 3);
  app.assignManager('tennis', 'other@bluecourt.tw');
  app.storage.setItem(SESSION, 'other');
  assert.equal(app.role(), 'manager');
  assert.deepEqual(
    app.managedEvents().map((e) => e.id),
    ['tennis'],
  );
  app.storage.setItem(SESSION, 'admin');
  app.assignManager('tennis', 'other@bluecourt.tw', true);
  app.storage.setItem(SESSION, 'other');
  assert.equal(app.role(), 'player');
});
test('only existing registered accounts can be assigned as referee and revocation restores player view', () => {
  const app = setup('manager');
  assert.throws(() => app.assignReferee('match-a', 'unknown@example.com'), /先請對方註冊/);
  app.assignReferee('match-a', 'other@bluecourt.tw');
  app.storage.setItem(SESSION, 'referee');
  assert.equal(app.role(), 'player');
  app.storage.setItem(SESSION, 'other');
  assert.equal(app.role(), 'referee');
  app.storage.setItem(SESSION, 'manager');
  app.assignReferee('match-a', '');
  app.storage.setItem(SESSION, 'other');
  assert.equal(app.role(), 'player');
});
test('referee cannot alter any unassigned match or event personnel', () => {
  const app = setup('player');
  assert.throws(() => app.checkin('match-a', 'A', true), /被指派/);
  assert.throws(() => app.score('match-a', 'A', 1), /被指派/);
  app.storage.setItem(SESSION, 'referee');
  assert.throws(() => app.assignReferee('match-a', 'other@bluecourt.tw'), /沒有這場賽事/);
});
function startMatch(app) {
  app.checkin('match-a', 'A', true);
  app.checkin('match-a', 'B', true);
  app.setStatus('match-a', 'started');
}
test('scoreboard only operates after both sides check in and match starts; scores never go below zero', () => {
  const app = setup('referee');
  assert.throws(() => app.score('match-a', 'A', 1), /僅已開始/);
  assert.throws(() => app.setStatus('match-a', 'started'), /完成雙方報到/);
  startMatch(app);
  app.score('match-a', 'A', -1);
  assert.equal(app.match('match-a').scoreA, 0);
  app.score('match-a', 'A', 1);
  assert.equal(app.match('match-a').scoreA, 1);
  app.setStatus('match-a', 'delayed');
  assert.throws(() => app.score('match-a', 'B', 1), /僅已開始/);
  app.setStatus('match-a', 'started');
  app.resetScore('match-a');
  assert.equal(app.match('match-a').scoreA, 0);
});
test('final confirmation detects changed score and locks all referee mutations after submission', () => {
  const app = setup('referee');
  startMatch(app);
  const rev = app.match('match-a').revision;
  app.score('match-a', 'A', 1);
  assert.throws(() => app.finalize('match-a', rev), /已更新/);
  app.score('match-a', 'A', 1);
  app.finalize('match-a', app.match('match-a').revision);
  assert.equal(app.match('match-a').locked, true);
  assert.equal(app.match('match-a').status, 'finished');
  for (const action of [
    () => app.score('match-a', 'A', 1),
    () => app.resetScore('match-a'),
    () => app.setStatus('match-a', 'started'),
    () => app.checkin('match-a', 'A', false),
  ])
    assert.throws(action);
});
test('a stale second store reloads locked data before attempting score updates', () => {
  const app = setup('referee');
  startMatch(app);
  const second = new CompetitionStore(app.storage);
  second.load();
  app.score('match-a', 'A', 1);
  app.finalize('match-a', app.match('match-a').revision);
  assert.throws(() => second.score('match-a', 'A', 1), /僅已開始/);
});
test('only event managers/admins can reopen a locked score, with a mandatory reason and audit trail', () => {
  const app = setup('referee');
  startMatch(app);
  app.score('match-a', 'A', 1);
  app.finalize('match-a', app.match('match-a').revision);
  app.requestCorrection('match-a', '錯誤比分');
  assert.throws(() => app.unlock('match-a', 'x'), /沒有這場賽事/);
  app.storage.setItem(SESSION, 'manager');
  assert.throws(() => app.unlock('match-a', ''), /填寫/);
  app.unlock('match-a', '已核對裁判紀錄');
  assert.equal(app.match('match-a').status, 'delayed');
  assert.equal(app.match('match-a').locked, false);
  assert(app.db.audit.some((a) => a.action === '重新開放比分' && a.detail === '已核對裁判紀錄'));
  app.storage.setItem(SESSION, 'referee');
  app.setStatus('match-a', 'started');
  app.score('match-a', 'B', 1);
  assert.equal(app.match('match-a').scoreB, 1);
});
test('enrollment requires a registered account, full contact details, open registration and no duplicates', async () => {
  const app = setup();
  app.logout();
  assert.throws(() => app.enroll('volleyball', { group: '公開組', team: 'A' }), /先註冊/);
  await app.register({ email: 'athlete@example.com', name: 'Athlete', password: 'safe-password' });
  assert.throws(() => app.enroll('volleyball', { group: '公開組', team: 'A' }), /報名資料/);
  app.updateProfile({
    name: 'Athlete',
    phone: '0912345678',
    birthday: '2000-01-01',
    emergencyName: 'Family',
    emergencyPhone: '0987654321',
  });
  app.enroll('volleyball', { group: '公開組', team: 'A' });
  assert(app.db.entries.some((r) => r.userId === app.current().id && r.eventId === 'volleyball'));
  assert.throws(() => app.enroll('volleyball', { group: '公開組', team: 'A' }), /已報名/);
  assert.throws(() => app.enroll('badminton', { group: '男子單打', team: 'A' }), /截止報名/);
});
test('closing registration generates approved first-round pairs by group, handles byes and cannot duplicate schedule', () => {
  const app = setup('admin');
  app.db.entries = app.db.entries.filter((r) => r.eventId !== 'volleyball');
  app.db.entries.push(
    ...['player', 'other', 'referee'].map((uid, i) => ({
      id: 'v' + i,
      eventId: 'volleyball',
      userId: uid,
      group: '公開組',
      team: 'Team ' + i,
      status: 'approved',
    })),
  );
  app.save();
  app.closeRegistration('volleyball');
  const matches = app.db.matches.filter((m) => m.eventId === 'volleyball');
  assert.equal(matches.length, 2);
  assert.equal(matches[0].teamB, 'Team 1');
  assert.equal(matches[1].teamB, '輪空');
  assert(matches[1].locked);
  assert.throws(() => app.closeRegistration('volleyball'), /已關閉/);
  app.storage.setItem(SESSION, 'player');
  assert.throws(() => app.enroll('volleyball', { group: '公開組', team: 'A' }), /截止報名/);
});
test('schedule changes propagate delay only to later pending matches on the same event, day and court', () => {
  const app = setup('manager');
  const base = app.match('match-a');
  app.db.matches.push(
    { ...base, id: 'later', time: '10:00' },
    { ...base, id: 'other-court', court: 2, time: '10:00' },
    { ...base, id: 'other-event', eventId: 'tennis', time: '10:00' },
    { ...base, id: 'locked', time: '11:00', locked: true, status: 'finished' },
  );
  app.save();
  app.changeMatch('match-a', {
    date: '2026-11-21',
    time: '09:30',
    court: 2,
    status: 'delayed',
    delay: 30,
  });
  assert.equal(app.match('later').time, '10:30');
  assert.equal(app.match('later').status, 'delayed');
  for (const mid of ['other-court', 'other-event']) assert.equal(app.match(mid).time, '10:00');
  assert.equal(app.match('locked').time, '11:00');
  assert.throws(
    () => app.changeMatch('match-a', { date: 'bad', time: '12:99', court: 99, status: 'started' }),
    /有效場地/,
  );
});
test('personal data update cannot escalate privileges or overwrite another account', () => {
  const app = setup();
  app.updateProfile({
    name: 'Updated',
    phone: '0912345678',
    birthday: '2000-01-01',
    admin: true,
    id: 'admin',
    email: 'changed@example.com',
  });
  assert.equal(app.current().id, 'player');
  assert.equal(app.current().admin, false);
  assert.equal(app.current().email, 'player@bluecourt.tw');
});

test('expired registrations automatically close and schedule once without giving guests management privileges', () => {
  const app = setup();
  app.db.entries = app.db.entries.filter((r) => r.eventId !== 'volleyball');
  app.db.events.find((e) => e.id === 'volleyball').deadline = '2020-01-01';
  app.db.entries.push(
    {
      id: 'expired-a',
      eventId: 'volleyball',
      userId: 'player',
      group: '公開組',
      team: 'A',
      status: 'approved',
    },
    {
      id: 'expired-b',
      eventId: 'volleyball',
      userId: 'other',
      group: '公開組',
      team: 'B',
      status: 'approved',
    },
  );
  app.save();
  app.logout();
  app.expireRegistrations();
  assert.equal(app.event('volleyball').registrationOpen, false);
  assert.equal(app.db.matches.filter((m) => m.eventId === 'volleyball').length, 1);
  app.expireRegistrations();
  assert.equal(app.db.matches.filter((m) => m.eventId === 'volleyball').length, 1);
  assert.equal(app.role(), 'guest');
});
test('stale manager forms cannot overwrite a newer referee status', () => {
  const app = setup('referee');
  const oldRevision = app.match('match-a').revision;
  startMatch(app);
  app.storage.setItem(SESSION, 'manager');
  assert.throws(
    () =>
      app.changeMatch('match-a', {
        date: '2026-11-21',
        time: '09:30',
        court: 1,
        status: 'pending',
        revision: oldRevision,
      }),
    /場次資訊已更新/,
  );
  assert.equal(app.match('match-a').status, 'started');
});

test('demo has three events and a complete 48-entry badminton tournament with linked rounds', async () => {
  const app = setup('admin');
  assert.equal(app.db.events.length, 3);
  const event = app.event('badminton');
  assert.equal(event.groups.length, 3);
  for (const group of event.groups) {
    assert.equal(
      app.db.entries.filter((r) => r.eventId === event.id && r.group === group).length,
      16,
    );
    const matches = app.db.matches.filter((m) => m.eventId === event.id && m.group === group);
    assert.equal(matches.length, 15);
    for (const [round, count] of [
      ['16 強', 8],
      ['8 強', 4],
      ['準決賽', 2],
      ['決賽', 1],
    ])
      assert.equal(matches.filter((m) => m.roundLabel === round).length, count);
    assert(
      matches
        .filter((m) => m.roundLabel !== '決賽')
        .every((m) => app.db.matches.some((next) => next.id === m.nextMatchId)),
    );
  }
  const counts = [app.db.entries.length, app.db.matches.length];
  app.db.matches[0].scoreA = 7;
  app.save();
  await app.init();
  assert.deepEqual([app.db.entries.length, app.db.matches.length], counts);
  assert.equal(app.db.matches[0].scoreA, 7);
});
test('points and game wins are independently editable, recorded, resettable, and locked together', () => {
  const app = setup('referee');
  startMatch(app);
  app.score('match-a', 'A', 1, 'games');
  app.score('match-a', 'B', 1, 'points');
  assert.equal(app.match('match-a').gamesA, 1);
  assert.equal(app.match('match-a').scoreB, 1);
  app.finishGame('match-a', app.match('match-a').revision);
  assert.equal(app.match('match-a').gamesB, 1);
  assert.equal(app.match('match-a').scoreB, 0);
  assert.deepEqual(app.match('match-a').gameHistory, [{ scoreA: 0, scoreB: 1 }]);
  app.score('match-a', 'A', 1);
  app.resetScore('match-a');
  assert.equal(app.match('match-a').gamesA, 1);
  app.resetScore('match-a', 'all');
  assert.equal(app.match('match-a').gamesA, 0);
  assert.equal(app.match('match-a').gameHistory.length, 0);
  assert.throws(() => app.finishGame('match-a', app.match('match-a').revision), /相同/);
  app.score('match-a', 'A', 1, 'games');
  app.finalize('match-a', app.match('match-a').revision);
  assert.throws(() => app.score('match-a', 'B', 1, 'games'));
  assert.throws(() => app.resetScore('match-a', 'all'));
});
test('match edits preserve named venues and courts and delay only the original venue/court combination', () => {
  const app = setup('manager'),
    base = app.match('match-a');
  app.db.matches.push(
    { ...base, id: 'same-name-other-venue', venue: '另一場館', time: '10:00' },
    { ...base, id: 'same-venue-later', time: '10:00' },
  );
  app.save();
  app.changeMatch('match-a', {
    date: base.date,
    time: '09:30',
    venue: '體育中心 2F',
    court: '中央球場 A',
    status: 'delayed',
    delay: 25,
  });
  assert.equal(app.match('match-a').court, '中央球場 A');
  assert.equal(app.match('match-a').venue, '體育中心 2F');
  assert.equal(app.match('same-name-other-venue').time, '10:00');
  assert.equal(app.match('same-venue-later').time, '10:25');
});
test('registration accepts contact details in the application and saves a contact snapshot', async () => {
  const app = setup();
  await app.register({ email: 'form@example.com', name: 'Form Player', password: 'safe-password' });
  app.enroll('tennis', {
    group: '男子單打',
    team: 'My Team',
    name: 'Form Player',
    phone: '0912345678',
    birthday: '2000-01-01',
    emergencyName: 'Family',
    emergencyPhone: '0987654321',
  });
  const entry = app.db.entries.find((r) => r.userId === app.current().id);
  assert.equal(entry.contact.phone, '0912345678');
  assert.equal(app.current().emergencyName, 'Family');
});
test('final badminton winners advance and reopening clears a pending qualifier without modifying active downstream games', () => {
  const app = setup('referee');
  startMatch(app);
  app.score('match-a', 'A', 1, 'games');
  const nextId = app.match('match-a').nextMatchId;
  app.finalize('match-a', app.match('match-a').revision);
  assert.equal(app.match(nextId).entryA, 'entry-a');
  assert.equal(app.match(nextId).teamA, '王立晨');
  app.storage.setItem(SESSION, 'manager');
  app.unlock('match-a', 'Review');
  assert.equal(app.match(nextId).entryA, null);
  app.storage.setItem(SESSION, 'referee');
  app.setStatus('match-a', 'started');
  app.finalize('match-a', app.match('match-a').revision);
  app.match(nextId).status = 'started';
  app.save();
  app.storage.setItem(SESSION, 'manager');
  assert.throws(() => app.unlock('match-a', 'Review again'), /下輪已開始/);
});

test('demo match times do not double-book a venue/court and next rounds occur after feeders', () => {
  const app = setup('admin'),
    seen = new Set();
  for (const m of app.db.matches.filter((m) => m.eventId === 'badminton')) {
    const key = [m.date, m.time, m.venue, m.court].join('|');
    assert(!seen.has(key), key);
    seen.add(key);
    if (m.nextMatchId) assert(m.time < app.match(m.nextMatchId).time);
  }
});

test('older local data is upgraded without resetting existing account records or changed match scores', async () => {
  const app = setup();
  delete app.db.demoVersion;
  app.db.entries = app.db.entries.filter((r) => ['entry-a', 'entry-b'].includes(r.id));
  app.db.matches = app.db.matches.filter((m) => m.id === 'match-a');
  app.match('match-a').scoreA = 9;
  app.match('match-a').court = '原有命名場地';
  app.current().name = '保留使用者';
  app.save();
  await app.init();
  assert.equal(app.match('match-a').scoreA, 9);
  assert.equal(app.match('match-a').court, '原有命名場地');
  assert.equal(app.current().name, '保留使用者');
  assert.equal(app.db.entries.filter((r) => r.eventId === 'badminton').length, 48);
  assert.equal(app.db.matches.filter((m) => m.eventId === 'badminton').length, 45);
});
test('new event location inventory accepts multiple venues and named courts for automatic pairings', () => {
  const app = setup('admin');
  const e = app.createEvent({
    name: '新賽事',
    sport: '羽球',
    location: '運動中心',
    date: '2099-01-20',
    deadline: '2099-01-18',
    time: '09:00',
    courts: 1,
    capacity: 16,
    interval: 40,
    groups: '公開組',
    locations: '主館｜中央場地\n副館｜中央場地',
  });
  assert.equal(e.courts, 2);
  assert.equal(e.locations[1].venue, '副館');
  app.db.entries.push(
    ...['player', 'other'].map((uid, i) => ({
      id: 'new-entry-' + i,
      userId: uid,
      eventId: e.id,
      group: '公開組',
      team: 'Team ' + i,
      status: 'approved',
    })),
  );
  app.save();
  app.closeRegistration(e.id);
  const m = app.db.matches.find((m) => m.eventId === e.id);
  assert.equal(m.venue, '主館');
  assert.equal(m.court, '中央場地');
});

test('demo scenarios use today, within-one-month open registration, and a separate later open event', () => {
  const app = setup(),
    demo = require('../demo-data.js'),
    today = demo.todayDate();
  const a = app.event('badminton'),
    b = app.event('volleyball'),
    c = app.event('tennis');
  assert.equal(a.date, today);
  assert.equal(demo.eventPhase(a, app.db.matches).key, 'live');
  assert.equal(b.date, demo.offsetDate(today, 21));
  assert.equal(demo.eventPhase(b, app.db.matches).key, 'upcoming');
  assert(b.registrationOpen);
  assert.equal(c.date, demo.offsetDate(today, 60));
  assert.equal(demo.eventPhase(c, app.db.matches).key, 'open');
  assert(c.registrationOpen);
  const tomorrow = app.db.matches
    .filter((m) => m.status === 'started')
    .map((m) => ({ ...m, date: demo.offsetDate(today, 1) }));
  assert.notEqual(demo.eventPhase(a, tomorrow).key, 'live');
});
test('dedicated volleyball manager authenticates and only manages the upcoming registration event', async () => {
  const app = setup();
  await app.login('volleyball-manager@bluecourt.tw', 'BlueCourt2026!');
  assert.equal(app.role(), 'manager');
  assert.deepEqual(
    app.managedEvents().map((e) => e.id),
    ['volleyball'],
  );
  assert.throws(() => app.closeRegistration('tennis'), /沒有這場賽事/);
  const uid = app.current().id;
  app.storage.setItem(SESSION, 'admin');
  app.assignManager('volleyball', 'volleyball-manager@bluecourt.tw', true);
  await app.init();
  assert(!app.event('volleyball').managers.includes(uid));
});

test('external livestream URL settings are event-scoped and reject non-web destinations', () => {
  const app = setup('manager');
  app.updateStream('badminton', 'https://www.youtube.com/watch?v=example&feature=live');
  assert.equal(
    app.event('badminton').streamUrl,
    'https://www.youtube.com/watch?v=example&feature=live',
  );
  assert.throws(() => app.updateStream('tennis', 'https://www.youtube.com/'), /沒有這場賽事/);
  assert.throws(() => app.updateStream('badminton', 'javascript:alert(1)'), /有效/);
  app.updateStream('badminton', '');
  assert.equal(app.event('badminton').streamUrl, '');
  app.load();
  assert.equal(app.event('badminton').streamUrl, '');
  app.storage.setItem(SESSION, 'referee');
  assert.throws(() => app.updateStream('badminton', 'https://www.youtube.com/'), /沒有這場賽事/);
});
