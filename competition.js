/* Local prototype data and event-scoped permissions. A server must enforce these rules in production. */
(function (root) {
  'use strict';
  const demo =
    typeof module !== 'undefined' && module.exports
      ? require('./demo-data.js')
      : root.BlueCourtDemo;
  const KEY = 'bluecourt-v2';
  const SESSION = 'bluecourt-session-v2';
  const labels = { admin: '系統管理員', manager: '賽事管理員', referee: '裁判', player: '選手' };
  const statuses = {
    pending: '尚未開始',
    started: '開始',
    delayed: '延後',
    cancelled: '取消',
    finished: '已結束',
  };
  const fail = (message) => {
    throw new Error(message);
  };
  const id = () => crypto.randomUUID();
  const clean = (value) => String(value ?? '').trim();
  const email = (value) => clean(value).toLowerCase();
  const dateValid = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
  const integer = (v, min, max) =>
    Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
  async function passwordHash(password, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
      'deriveBits',
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
      key,
      256,
    );
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  class CompetitionStore {
    constructor(storage = localStorage) {
      this.storage = storage;
      this.db = null;
      this.onchange = () => {};
    }
    load() {
      const raw = this.storage.getItem(KEY);
      if (raw) {
        let db;
        try {
          db = JSON.parse(raw);
        } catch {
          fail('本機資料無法讀取，請先備份瀏覽器資料。');
        }
        if (
          db.version !== 2 ||
          !['users', 'events', 'entries', 'matches', 'audit'].every((k) => Array.isArray(db[k]))
        )
          fail('本機資料格式不相容。');
        demo.normalize(db);
        this.db = db;
      }
      return this.db;
    }
    save() {
      this.storage.setItem(KEY, JSON.stringify(this.db));
      this.onchange();
    }
    async init() {
      if (this.load()) {
        const changed = demo.upgrade(this.db);
        const managerAdded = await this.ensureDemoManager();
        if (changed || managerAdded) this.save();
        return;
      }
      const users = [];
      for (const [uid, mail, name, admin] of [
        ['admin', 'admin@bluecourt.tw', '系統管理員', true],
        ['manager', 'staff@bluecourt.tw', '賽事管理員', false],
        ['referee', 'referee@bluecourt.tw', '場地裁判', false],
        ['player', 'player@bluecourt.tw', '王立晨', false],
        ['other', 'other@bluecourt.tw', '林俊宏', false],
      ]) {
        const salt = id();
        users.push({
          id: uid,
          email: mail,
          name,
          admin,
          demo: true,
          salt,
          hash: await passwordHash('BlueCourt2026!', salt),
          phone: '0912345678',
          birthday: '2000-01-01',
          gender: '不透露',
          address: '',
          emergencyName: '陳先生',
          emergencyPhone: '0987654321',
          level: '3.8',
          photo: '',
        });
      }
      const events = [
        {
          id: 'badminton',
          name: '台灣羽球盃',
          sport: '羽球',
          location: '台北市立體育館',
          date: '2026-11-21',
          time: '09:00',
          deadline: '2026-11-20',
          courts: 4,
          interval: 40,
          capacity: 64,
          groups: ['男子單打', '女子單打'],
          managers: ['manager'],
          registrationOpen: false,
          scheduled: true,
        },
        {
          id: 'volleyball',
          name: '大學排球聯賽',
          sport: '排球',
          location: '大學體育館',
          date: '2026-12-20',
          time: '09:00',
          deadline: '2026-12-18',
          courts: 2,
          interval: 60,
          capacity: 32,
          groups: ['公開組'],
          managers: [],
          registrationOpen: true,
          scheduled: false,
        },
        {
          id: 'tennis',
          name: '網球積分賽',
          sport: '網球',
          location: '台北網球中心',
          date: '2026-12-26',
          time: '09:00',
          deadline: '2026-12-24',
          courts: 6,
          interval: 60,
          capacity: 64,
          groups: ['男子單打', '女子單打'],
          managers: [],
          registrationOpen: true,
          scheduled: false,
        },
      ];
      this.db = {
        version: 2,
        users,
        events,
        entries: [
          {
            id: 'entry-a',
            eventId: 'badminton',
            userId: 'player',
            group: '男子單打',
            team: '王立晨',
            status: 'approved',
          },
          {
            id: 'entry-b',
            eventId: 'badminton',
            userId: 'other',
            group: '男子單打',
            team: '林俊宏',
            status: 'approved',
          },
        ],
        matches: [
          {
            id: 'match-a',
            eventId: 'badminton',
            group: '男子單打',
            teamA: '王立晨',
            teamB: '林俊宏',
            entryA: 'entry-a',
            entryB: 'entry-b',
            date: '2026-11-21',
            time: '09:00',
            court: 1,
            refereeId: 'referee',
            status: 'pending',
            scoreA: 0,
            scoreB: 0,
            gamesA: 0,
            gamesB: 0,
            gameHistory: [],
            checkedA: false,
            checkedB: false,
            locked: false,
            revision: 0,
          },
        ],
        audit: [],
      };
      // Keep former prototype event definitions; do not infer privileges from the old self-selected role.
      try {
        const old = JSON.parse(this.storage.getItem('bluecourt-managed-events') || '[]');
        if (Array.isArray(old))
          old.forEach((e) => {
            if (!e.name || !dateValid(e.date)) return;
            events.push({
              ...events[1],
              id: 'legacy-' + clean(e.id || id()),
              name: clean(e.name),
              location: clean(e.location),
              date: e.date,
              deadline: dateValid(e.deadline) ? e.deadline : e.date,
              groups: Array.isArray(e.groups) && e.groups.length ? e.groups.map(clean) : ['公開組'],
              managers: [],
              courts: integer(e.courts, 1, 100) ? Number(e.courts) : 1,
              capacity: integer(e.capacity, 2, 256) ? Number(e.capacity) : 32,
            });
          });
      } catch {
        /* Legacy data remains in its original storage key. */
      }
      demo.upgrade(this.db);
      await this.ensureDemoManager();
      this.save();
    }
    async ensureDemoManager() {
      if (this.db.demoManagerVersion === 1) return false;
      const e = this.db.events.find((e) => e.id === 'volleyball');
      if (!e) return false;
      let user = this.db.users.find((u) => u.email === 'volleyball-manager@bluecourt.tw');
      if (!user) {
        const salt = id();
        user = {
          id: id(),
          email: 'volleyball-manager@bluecourt.tw',
          name: '排球聯賽管理員',
          admin: false,
          demo: true,
          salt,
          hash: await passwordHash('BlueCourt2026!', salt),
          phone: '0912345678',
          birthday: '2000-01-01',
          gender: '不透露',
          address: '',
          emergencyName: '示範聯絡人',
          emergencyPhone: '0987654321',
          level: '',
          photo: '',
        };
        this.db.users.push(user);
      }
      if (!e.managers.includes(user.id)) e.managers.push(user.id);
      this.db.demoManagerVersion = 1;
      return true;
    }
    current() {
      const uid = this.storage.getItem(SESSION);
      return this.db.users.find((u) => u.id === uid) || null;
    }
    role(user = this.current()) {
      if (!user) return 'guest';
      if (user.admin) return 'admin';
      if (this.db.events.some((e) => e.managers.includes(user.id))) return 'manager';
      if (this.db.matches.some((m) => m.refereeId === user.id)) return 'referee';
      return 'player';
    }
    requireUser() {
      const u = this.current();
      return u || fail('請先註冊並登入。');
    }
    event(eid) {
      return this.db.events.find((e) => e.id === eid) || fail('找不到賽事。');
    }
    canManage(eid, user = this.current()) {
      return !!user && (user.admin || this.event(eid).managers.includes(user.id));
    }
    managedEvents() {
      return this.db.events.filter((e) => this.canManage(e.id));
    }
    requireManager(eid) {
      if (!this.canManage(eid)) fail('你沒有這場賽事的管理權限。');
    }
    requireAdmin() {
      if (!this.requireUser().admin) fail('只有系統管理員可以操作。');
    }
    match(mid) {
      return this.db.matches.find((m) => m.id === mid) || fail('找不到場次。');
    }
    requireReferee(mid) {
      const u = this.requireUser(),
        m = this.match(mid);
      if (m.refereeId !== u.id) fail('你只能操作被指派的場次。');
      return m;
    }
    log(action, target, detail = '') {
      this.db.audit.unshift({
        id: id(),
        at: new Date().toISOString(),
        userId: this.current()?.id,
        action,
        target,
        detail,
      });
    }
    async register(data) {
      const mail = email(data.email),
        name = clean(data.name),
        password = String(data.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || !name || password.length < 8)
        fail('請填寫姓名、有效電子郵件與至少 8 字元密碼。');
      const salt = id(),
        hash = await passwordHash(password, salt);
      this.load();
      if (this.db.users.some((u) => u.email === mail)) fail('此電子郵件已註冊，請直接登入。');
      const user = {
        id: id(),
        email: mail,
        name,
        hash,
        salt,
        admin: false,
        phone: '',
        birthday: '',
        gender: '不透露',
        address: '',
        emergencyName: '',
        emergencyPhone: '',
        level: '',
        photo: '',
      };
      this.db.users.push(user);
      this.storage.setItem(SESSION, user.id);
      this.log('註冊選手帳號', user.id);
      this.save();
      return user;
    }
    async login(mail, password) {
      this.load();
      const user = this.db.users.find((u) => u.email === email(mail));
      if (
        !user ||
        user.canLogin === false ||
        (await passwordHash(String(password), user.salt)) !== user.hash
      )
        fail('電子郵件或密碼錯誤。');
      this.load();
      const latest = this.db.users.find((u) => u.id === user.id);
      this.storage.setItem(SESSION, latest.id);
      this.onchange();
      return latest;
    }
    logout() {
      this.storage.removeItem(SESSION);
      this.onchange();
    }
    updateProfile(data) {
      this.load();
      const u = this.requireUser();
      if (!clean(data.name) || !/^[+\d ()-]{7,20}$/.test(clean(data.phone)))
        fail('請填寫姓名及有效聯絡電話。');
      if (
        data.birthday &&
        (!dateValid(data.birthday) || data.birthday > new Date().toISOString().slice(0, 10))
      )
        fail('請確認出生日期。');
      if (data.emergencyPhone && !/^[+\d ()-]{7,20}$/.test(clean(data.emergencyPhone)))
        fail('緊急聯絡電話格式不正確。');
      for (const key of [
        'name',
        'phone',
        'birthday',
        'gender',
        'address',
        'emergencyName',
        'emergencyPhone',
        'level',
      ])
        u[key] = clean(data[key]);
      this.log('更新個人資料', u.id);
      this.save();
    }
    enroll(eid, data) {
      this.load();
      const u = this.requireUser(),
        e = this.event(eid);
      if (
        !e.registrationOpen ||
        e.deadline < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
      )
        fail('此賽事已截止報名。');
      const contact = Object.fromEntries(
        ['name', 'phone', 'birthday', 'gender', 'address', 'emergencyName', 'emergencyPhone'].map(
          (key) => [key, clean(data[key] ?? u[key])],
        ),
      );
      if (
        !contact.name ||
        !contact.phone ||
        !contact.birthday ||
        !contact.emergencyName ||
        !contact.emergencyPhone
      )
        fail('請填妥報名資料中的姓名、電話、生日與緊急聯絡人。');
      if (
        !/^[+\d ()-]{7,20}$/.test(contact.phone) ||
        !/^[+\d ()-]{7,20}$/.test(contact.emergencyPhone) ||
        !dateValid(contact.birthday) ||
        contact.birthday > new Date().toISOString().slice(0, 10)
      )
        fail('請確認聯絡電話、生日與緊急聯絡電話格式。');
      if (!e.groups.includes(data.group)) fail('請選擇有效組別。');
      if (!clean(data.team)) fail('請填寫選手或隊伍名稱。');
      if (this.db.entries.some((r) => r.eventId === eid && r.userId === u.id))
        fail('你已報名此賽事。');
      if (this.db.entries.filter((r) => r.eventId === eid).length >= e.capacity)
        fail('此賽事報名名額已滿。');
      Object.assign(u, contact);
      this.db.entries.push({
        id: id(),
        eventId: eid,
        userId: u.id,
        group: data.group,
        team: clean(data.team),
        contact,
        status: 'pending',
      });
      this.log('報名賽事', eid, clean(data.team));
      this.save();
    }
    review(entryId, status) {
      this.load();
      const entry = this.db.entries.find((r) => r.id === entryId) || fail('找不到報名資料。');
      this.requireManager(entry.eventId);
      if (this.event(entry.eventId).scheduled) fail('賽程已產生，請透過賽事更動處理異動。');
      if (!['approved', 'pending', 'rejected'].includes(status)) fail('審核狀態無效。');
      entry.status = status;
      this.log('報名審核', entryId, status);
      this.save();
    }
    closeRegistration(eid) {
      this.load();
      this.requireManager(eid);
      const e = this.event(eid);
      if (!e.registrationOpen) fail('報名已關閉。');
      this._buildSchedule(e);
      this.log('關閉報名並產生首輪賽程', eid);
      this.save();
    }
    _buildSchedule(e) {
      const eid = e.id;
      e.registrationOpen = false;
      const entries = this.db.entries.filter((r) => r.eventId === eid && r.status === 'approved');
      for (const group of e.groups) {
        const groupEntries = entries.filter((r) => r.group === group);
        for (let i = 0; i < groupEntries.length; i += 2) {
          const a = groupEntries[i],
            b = groupEntries[i + 1],
            index = this.db.matches.filter((m) => m.eventId === eid).length;
          const start = new Date(e.date + 'T' + e.time + ':00+08:00');
          start.setMinutes(start.getMinutes() + Math.floor(index / e.courts) * e.interval);
          const parts = Object.fromEntries(
            new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Taipei',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            })
              .formatToParts(start)
              .map((p) => [p.type, p.value]),
          );
          this.db.matches.push({
            id: id(),
            eventId: eid,
            group,
            teamA: a.team,
            teamB: b?.team || '輪空',
            entryA: a.id,
            entryB: b?.id || null,
            date: parts.year + '-' + parts.month + '-' + parts.day,
            time: parts.hour + ':' + parts.minute,
            venue: e.locations[index % e.locations.length].venue,
            court: e.locations[index % e.locations.length].court,
            refereeId: '',
            status: b ? 'pending' : 'finished',
            scoreA: 0,
            scoreB: 0,
            gamesA: 0,
            gamesB: 0,
            gameHistory: [],
            checkedA: false,
            checkedB: !b,
            locked: !b,
            revision: 0,
          });
        }
      }
      e.scheduled = true;
    }
    expireRegistrations() {
      this.load();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
      const expired = this.db.events.filter((e) => e.registrationOpen && e.deadline < today);
      if (!expired.length) return;
      expired.forEach((e) => {
        this._buildSchedule(e);
        this.log('報名截止自動排程', e.id);
      });
      this.save();
    }
    assignManager(eid, mail, remove = false) {
      this.load();
      this.requireAdmin();
      const e = this.event(eid),
        u = this.db.users.find((u) => u.email === email(mail));
      if (!u || u.canLogin === false) fail('請使用已註冊且可登入的帳號。');
      e.managers = e.managers.filter((uid) => uid !== u.id);
      if (!remove) e.managers.push(u.id);
      this.log(remove ? '移除賽事管理員' : '指派賽事管理員', eid, u.email);
      this.save();
    }
    assignReferee(mid, mail) {
      this.load();
      const m = this.match(mid);
      this.requireManager(m.eventId);
      const u = mail ? this.db.users.find((u) => u.email === email(mail)) : null;
      if (mail && (!u || u.canLogin === false)) fail('請先請對方註冊可登入的帳號。');
      if (m.locked) fail('此場次比分已鎖定，無法變更裁判。');
      if (u && (u.admin || this.event(m.eventId).managers.includes(u.id)))
        fail('請指派此賽事管理員以外的帳號擔任裁判。');
      m.refereeId = u?.id || '';
      m.revision++;
      this.log('更新場次裁判', mid, u?.email || '解除指派');
      this.save();
    }
    setAdmin(uid, value) {
      this.load();
      this.requireAdmin();
      const u = this.db.users.find((u) => u.id === uid) || fail('找不到使用者。');
      if (u.id === this.current().id && !value) fail('不能移除自己的系統管理員權限。');
      u.admin = !!value;
      this.log('更新系統管理員權限', uid, String(value));
      this.save();
    }
    updateStream(eid, value) {
      this.load();
      this.requireManager(eid);
      const url = demo.streamUrl(value);
      if (String(value || '').trim() && !url) fail('請填寫有效的 http 或 https 直播網址。');
      this.event(eid).streamUrl = url;
      this.log('更新直播網址', eid, url || '移除連結');
      this.save();
    }
    createEvent(data) {
      this.load();
      this.requireAdmin();
      if (
        !clean(data.name) ||
        !clean(data.location) ||
        !dateValid(data.date) ||
        !dateValid(data.deadline) ||
        data.deadline > data.date ||
        !/^\d{2}:\d{2}$/.test(data.time)
      )
        fail('請確認賽事名稱、地點、日期與截止日期。');
      if (
        ![data.courts, data.capacity, data.interval].every((v) => integer(v, 1, 256)) ||
        Number(data.capacity) < 2
      )
        fail('請確認場地數、名額與場次間隔。');
      const groups = [
        ...new Set(
          clean(data.groups)
            .split(/[、,，]/)
            .map(clean)
            .filter(Boolean),
        ),
      ];
      if (!groups.length) fail('請至少設定一個組別。');
      const locations = clean(data.locations)
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/[｜|]/).map(clean);
          if (parts.length !== 2 || !parts[0] || !parts[1])
            fail('場地清單請每行填寫「場館｜場地名稱」。');
          return { venue: parts[0], court: parts[1] };
        });
      if (new Set(locations.map((p) => p.venue + '|' + p.court)).size !== locations.length)
        fail('場館與場地名稱不能重複。');
      const stream = demo.streamUrl(data.streamUrl);
      if (data.streamUrl && !stream) fail('請填寫有效的 http 或 https 直播網址。');
      const e = {
        id: id(),
        name: clean(data.name),
        sport: clean(data.sport),
        streamUrl: stream,
        location: clean(data.location),
        date: data.date,
        time: data.time,
        deadline: data.deadline,
        courts: locations.length || Number(data.courts),
        locations: locations.length
          ? locations
          : Array.from({ length: Number(data.courts) }, (_, i) => ({
              venue: clean(data.location),
              court: String(i + 1),
            })),
        capacity: Number(data.capacity),
        interval: Number(data.interval),
        groups,
        managers: [],
        registrationOpen: true,
        scheduled: false,
      };
      this.db.events.push(e);
      this.log('登錄賽事', e.id);
      this.save();
      return e;
    }
    changeMatch(mid, data) {
      this.load();
      const m = this.match(mid);
      this.requireManager(m.eventId);
      if (m.locked) fail('比分已鎖定，請先填寫原因並重新開放。');
      if (data.revision !== undefined && Number(data.revision) !== m.revision)
        fail('場次資訊已更新，請確認最新資料後重新修改。');
      if (
        !dateValid(data.date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time) ||
        !clean(data.court) ||
        clean(data.court).length > 100 ||
        !clean(data.venue ?? m.venue)
      )
        fail('請確認日期、時間及有效場地。');
      if (!['pending', 'started', 'delayed', 'cancelled'].includes(data.status))
        fail('場次狀態無效。');
      if (data.status === 'started' && m.bracket && (!m.entryA || !m.entryB))
        fail('前輪勝方尚未確認，不能開始此場次。');
      if (data.status === 'started' && (!m.checkedA || !m.checkedB))
        fail('雙方完成報到後才能開始。');
      if (!integer(data.delay || 0, 0, 1440)) fail('後續延後分鐘數必須介於 0 至 1440。');
      const oldDate = m.date,
        oldTime = m.time,
        oldCourt = m.court,
        oldVenue = m.venue;
      Object.assign(m, {
        date: data.date,
        time: data.time,
        court: clean(data.court),
        venue: clean(data.venue ?? m.venue),
        status: data.status,
      });
      m.revision++;
      const event = this.event(m.eventId);
      if (!event.locations.some((p) => p.venue === m.venue && p.court === m.court)) {
        event.locations.push({ venue: m.venue, court: m.court });
        event.courts = event.locations.length;
      }
      if (Number(data.delay))
        this.db.matches
          .filter(
            (other) =>
              other.id !== mid &&
              other.eventId === m.eventId &&
              other.date === oldDate &&
              String(other.court) === String(oldCourt) &&
              other.venue === oldVenue &&
              other.time > oldTime &&
              !other.locked &&
              other.status !== 'started' &&
              other.status !== 'cancelled',
          )
          .forEach((other) => {
            const t = new Date(other.date + 'T' + other.time + ':00+08:00');
            t.setMinutes(t.getMinutes() + Number(data.delay));
            const parts = Object.fromEntries(
              new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Taipei',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              })
                .formatToParts(t)
                .map((p) => [p.type, p.value]),
            );
            other.date = parts.year + '-' + parts.month + '-' + parts.day;
            other.time = parts.hour + ':' + parts.minute;
            other.status = 'delayed';
            other.revision++;
          });
      this.log('賽事更動', mid, JSON.stringify(data));
      this.save();
    }
    checkin(mid, side, checked) {
      this.load();
      const m = this.requireReferee(mid);
      if (m.bracket && !m['entry' + side]) fail('此位置的前輪勝方尚未確認。');
      if (!['A', 'B'].includes(side) || m.locked || ['started', 'cancelled'].includes(m.status))
        fail('目前無法變更報到。');
      m['checked' + side] = !!checked;
      m.revision++;
      this.log('場次報到', mid, side + ':' + checked);
      this.save();
    }
    setStatus(mid, status) {
      this.load();
      const m = this.requireReferee(mid);
      if (m.locked || !['started', 'delayed', 'cancelled'].includes(status))
        fail('此場次目前不能更改狀態。');
      if (status === 'started' && m.bracket && (!m.entryA || !m.entryB))
        fail('前輪勝方尚未確認，不能開始此場次。');
      if (status === 'started' && (!m.checkedA || !m.checkedB)) fail('請先完成雙方報到。');
      m.status = status;
      m.revision++;
      this.log('裁判更新賽況', mid, status);
      this.save();
    }
    score(mid, side, delta, measure = 'points') {
      this.load();
      const m = this.requireReferee(mid);
      if (m.locked || m.status !== 'started') fail('僅已開始且未鎖定的場次可以計分。');
      if (!['A', 'B'].includes(side) || ![-1, 1].includes(delta)) fail('計分操作無效。');
      if (!['points', 'games'].includes(measure)) fail('比分類型無效。');
      const key = (measure === 'games' ? 'games' : 'score') + side;
      m[key] = Math.max(0, m[key] + delta);
      m.revision++;
      this.save();
    }
    resetScore(mid, scope = 'points') {
      this.load();
      const m = this.requireReferee(mid);
      if (m.locked || m.status !== 'started') fail('目前無法歸零比分。');
      if (!['points', 'all'].includes(scope)) fail('歸零類型無效。');
      m.scoreA = 0;
      m.scoreB = 0;
      if (scope === 'all') {
        m.gamesA = 0;
        m.gamesB = 0;
        m.gameHistory = [];
      }
      m.revision++;
      this.log('比分歸零', mid);
      this.save();
    }
    finishGame(mid, revision) {
      this.load();
      const m = this.requireReferee(mid);
      if (m.locked || m.status !== 'started') fail('僅進行中的場次可以記錄本局。');
      if (m.revision !== revision) fail('比分已更新，請重新確認。');
      if (m.scoreA === m.scoreB) fail('本局得分相同，請確認勝方後再記錄。');
      const winner = m.scoreA > m.scoreB ? 'A' : 'B';
      m.gameHistory.push({ scoreA: m.scoreA, scoreB: m.scoreB });
      m['games' + winner]++;
      m.scoreA = 0;
      m.scoreB = 0;
      m.revision++;
      this.log('記錄本局比分', mid, JSON.stringify(m.gameHistory.at(-1)));
      this.save();
    }
    finalize(mid, revision) {
      this.load();
      const m = this.requireReferee(mid);
      if (m.locked || m.status !== 'started') fail('此場次已鎖定或尚未開始。');
      if (m.revision !== revision) fail('比分或場次資訊已更新，請確認最新內容後再次送出。');
      const winner =
        m.gamesA !== m.gamesB
          ? m.gamesA > m.gamesB
            ? 'A'
            : 'B'
          : m.scoreA !== m.scoreB
            ? m.scoreA > m.scoreB
              ? 'A'
              : 'B'
            : '';
      const next = this.db.matches.find((next) => next.id === m.nextMatchId);
      if (m.bracket && !winner) fail('淘汰賽需有明確勝方，請確認局數與得分。');
      if (next && next.locked) fail('下輪比分已鎖定，請先聯絡管理員處理下輪場次。');
      if (
        next &&
        (next.status === 'started' || next.gamesA || next.gamesB || next.scoreA || next.scoreB)
      )
        fail('下輪已開始或已有比分，請聯絡管理員先確認下輪賽況。');
      if (next) {
        next['entry' + m.nextSlot] = m['entry' + winner];
        next['team' + m.nextSlot] = m['team' + winner];
        next.revision++;
      }
      m.winnerSide = winner;
      m.locked = true;
      m.status = 'finished';
      m.revision++;
      this.log(
        '確認最終比分並鎖定',
        mid,
        '局數 ' + m.gamesA + ':' + m.gamesB + '；本局得分 ' + m.scoreA + ':' + m.scoreB,
      );
      this.save();
    }
    unlock(mid, reason) {
      this.load();
      const m = this.match(mid);
      this.requireManager(m.eventId);
      if (!m.entryB) fail('輪空場次不需修改比分。');
      if (!m.locked || !clean(reason)) fail('請填寫重新開放比分的原因。');
      const next = this.db.matches.find((next) => next.id === m.nextMatchId);
      if (
        next &&
        (next.locked ||
          next.status === 'started' ||
          next.gamesA ||
          next.gamesB ||
          next.scoreA ||
          next.scoreB)
      )
        fail('下輪已開始或有比分，請先處理下輪場次後再重新開放前輪。');
      if (next) {
        next['entry' + m.nextSlot] = null;
        next['team' + m.nextSlot] = '前輪勝方待重新確認';
        next['checked' + m.nextSlot] = false;
        next.revision++;
      }
      m.locked = false;
      m.status = 'delayed';
      m.revision++;
      this.log('重新開放比分', mid, clean(reason));
      this.save();
    }
    requestCorrection(mid, reason) {
      this.load();
      const m = this.requireReferee(mid);
      if (!m.locked || !clean(reason)) fail('請填寫比分修正原因。');
      this.log('請求比分修正', mid, clean(reason));
      this.save();
    }
  }
  const api = { CompetitionStore, KEY, SESSION, labels, statuses };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlueCourt = api;
})(globalThis);
