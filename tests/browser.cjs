/* Dependency-free Chrome/Edge integration check. Run: node tests/browser.cjs */
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const http = require('node:http'),
  { spawn } = require('node:child_process'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    '.' +
      decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname === '/'
          ? '/index.html'
          : new URL(req.url, 'http://localhost').pathname,
      ),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(data);
  });
});
let browser, socket, profile;
const pending = new Map(),
  errors = [],
  popupUrls = [];
let sequence = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description,
    );
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error('Timed out: ' + expression);
}
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function fill(form, values) {
  await evaluate(
    `(()=>{const f=document.querySelector(${JSON.stringify(form)});for(const [k,v]of Object.entries(${JSON.stringify(values)}))f.elements[k].value=v;})()`,
  );
}
async function login(role) {
  await evaluate(
    "clearEnrollment();if(app.current()){app.logout();setView('home');refresh();}openLogin();",
  );
  const mail = {
    referee: 'referee@bluecourt.tw',
    manager: 'staff@bluecourt.tw',
    admin: 'admin@bluecourt.tw',
    player: 'player@bluecourt.tw',
  }[role];
  await fill('#loginForm', { email: mail, password: 'BlueCourt2026!' });
  await evaluate("document.getElementById('loginForm').requestSubmit()");
  await until("view==='workspace'");
}
(async () => {
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const executable = [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find(fs.existsSync);
    if (!executable) throw new Error('Chrome or Edge is required.');
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bluecourt-check-'));
    browser = spawn(
      executable,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        '--remote-allow-origins=*',
        '--user-data-dir=' + profile,
        'about:blank',
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let debug = '';
    const websocket = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser did not start')), 20000);
      browser.stderr.on('data', (chunk) => {
        debug += chunk;
        const match = debug.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      browser.on('error', reject);
    });
    const debugOrigin = new URL(websocket).origin.replace('ws:', 'http:');
    const pages = await (await fetch(debugOrigin + '/json')).json();
    socket = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => socket.addEventListener('open', r, { once: true }));
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const p = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) p.reject(new Error(JSON.stringify(data.error)));
        else p.resolve(data.result);
      } else if (data.method === 'Page.windowOpen') popupUrls.push(data.params.url);
      else if (data.method === 'Runtime.exceptionThrown')
        errors.push(
          data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text,
        );
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port });
    await until(
      "typeof app !== 'undefined' && app.db && document.getElementById('appLoading').hidden",
    );
    assert.equal(await evaluate("document.querySelectorAll('[data-login-role]').length"), 0);
    assert.equal(await evaluate("!!document.querySelector('[data-login-role=audience]')"), false);
    assert.equal(await evaluate("document.querySelectorAll('#eventGrid .event-card').length"), 3);
    assert.equal(
      await evaluate("document.querySelector('#heroScore .live-preview').href"),
      'https://www.youtube.com/',
    );
    assert.equal(
      await evaluate("document.querySelector('#heroScore .live-preview').target"),
      '_blank',
    );
    assert(
      await evaluate("!!document.querySelector('#heroScore .stream-live-badge .stream-live-dot')"),
    );
    assert.equal(await evaluate("document.querySelectorAll('#live .live-preview').length"), 1);
    const beforeTargets = (await send('Target.getTargets')).targetInfos.map((t) => t.targetId);
    await click('#heroScore .live-preview');
    await sleep(300);
    assert(popupUrls.includes('https://www.youtube.com/'));
    const newTargets = (await send('Target.getTargets')).targetInfos.filter(
      (t) => t.type === 'page' && !beforeTargets.includes(t.targetId),
    );
    for (const target of newTargets)
      await send('Target.closeTarget', { targetId: target.targetId });
    assert.equal(await evaluate('view'), 'home');
    console.log(
      'PASS: single live preview, top-left LIVE dot, and actual external YouTube new-tab navigation.',
    );
    assert.deepEqual(
      await evaluate("[...document.querySelectorAll('#home > section')].map(e=>e.id)"),
      ['live', 'events', 'schedule'],
    );
    assert.equal(
      await evaluate("!!document.querySelector('#players,#about,.hero-section')"),
      false,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('#live [data-command=enroll]').length"),
      0,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('#eventGrid [data-command=enroll]').length"),
      2,
    );
    assert.deepEqual(
      await evaluate("[...document.querySelectorAll('.event-phase')].map(e=>e.textContent)"),
      ['LIVE · 進行中', '即將開始', '報名中'],
    );
    await evaluate(
      "window.homeFixture=structuredClone(app.db.matches);const base=app.db.matches[0];app.db.matches=[{...base,id:'past-check',date:BlueCourtDemo.offsetDate(BlueCourtDemo.todayDate(),-1),status:'started'},{...base,id:'future-check',date:BlueCourtDemo.offsetDate(BlueCourtDemo.todayDate(),1),status:'started'}];app.save()",
    );
    assert.equal(await evaluate("document.querySelectorAll('#live [data-match-id]').length"), 0);
    await evaluate("publicTab='live';setView('public');renderPublic()");
    assert.equal(
      await evaluate("document.querySelectorAll('#workspaceContent [data-match-id]').length"),
      0,
    );
    await evaluate("app.db.matches=window.homeFixture;app.save();setView('home');refresh()");
    console.log(
      'PASS: Live-first home, event-card enrollment, three demo states, and date-only live scope.',
    );
    await click('[data-public-tab]');
    assert.equal(await evaluate('view'), 'public');
    console.log(
      'PASS: guest public schedule without login; unified account login without visible role choices.',
    );

    await login('referee');
    await click('[data-checkin][data-side=A]');
    await click('[data-checkin][data-side=B]');
    await click('[data-command=status][data-status=started]');
    await click('[data-command=score][data-side=A][data-delta="1"]');
    assert.equal(await evaluate("document.querySelector('.point-counter output').value"), '1');
    assert.equal(await evaluate("app.match('match-a').scoreA"), 1);
    await click('[data-command=score][data-side=A][data-measure=games][data-delta="1"]');
    assert.equal(await evaluate("app.match('match-a').gamesA"), 1);
    await click('[data-command=finish-game]');
    await click('#actionModalPrimary');
    assert.equal(await evaluate("app.match('match-a').gamesA"), 2);
    assert.equal(await evaluate("app.match('match-a').gameHistory.length"), 1);
    assert.equal(await evaluate("app.match('match-a').scoreA"), 0);
    await click('[data-command=score][data-side=A][data-measure=points][data-delta="1"]');
    await click('[data-command=finalize]');
    assert.equal(await evaluate("app.match('match-a').locked"), false);
    await click('#actionModalPrimary');
    assert.equal(await evaluate("app.match('match-a').locked"), true);
    assert.equal(await evaluate("document.querySelector('[data-command=score]').disabled"), true);
    await click('[data-command=correction]');
    await evaluate(
      "document.getElementById('correctionReason').value='Browser correction request'",
    );
    await click('#actionModalPrimary');
    console.log(
      'PASS: referee check-in, score controls, confirmation, final lock and correction request.',
    );

    await login('manager');
    assert.deepEqual(
      await evaluate("[...document.querySelector('#event-select').options].map(o=>o.value)"),
      ['badminton'],
    );
    await click('[data-command=tab][data-tab=personnel]');
    assert(
      await evaluate(
        "document.getElementById('currentPanel').textContent.includes('Browser correction request')",
      ),
    );
    await click('[data-command=tab][data-tab=changes]');
    await click('[data-command=unlock]');
    await evaluate("document.getElementById('correctionReason').value='Manager reviewed'");
    await click('#actionModalPrimary');
    assert.equal(await evaluate("app.match('match-a').locked"), false);
    console.log('PASS: manager event isolation, correction request visibility and reopening.');
    await fill('[data-form=match][data-match="match-a"]', {
      venue: '體育中心 2F',
      court: '中央球場 A',
    });
    await evaluate(
      "document.querySelector('[data-form=match][data-match=match-a]').requestSubmit()",
    );
    assert.equal(await evaluate("app.match('match-a').venue"), '體育中心 2F');
    assert.equal(await evaluate("app.match('match-a').court"), '中央球場 A');
    console.log('PASS: text venue and named court persist and display.');

    await login('admin');
    assert.equal(await evaluate("document.querySelector('#event-select').options.length"), 3);
    assert.equal(
      await evaluate("document.querySelectorAll('.category-summary article').length"),
      3,
    );
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('.category-summary strong')].map(n=>n.textContent)",
      ),
      ['16 組', '16 組', '16 組'],
    );
    assert.equal(await evaluate("app.db.matches.filter(m=>m.eventId==='badminton').length"), 45);
    await click('[data-command=group-filter][data-group="混合雙打"]');
    assert.equal(
      await evaluate("document.querySelectorAll('#currentPanel [data-match-id]').length"),
      15,
    );
    console.log('PASS: demo has three events, 48 badminton entries and all 45 bracket matches.');
    await click('[data-command=tab][data-tab=users]');
    await click('[data-command=subtab][data-tab=assignments]');
    assert(await evaluate("!!document.querySelector('[data-form=manager]')"));
    console.log('PASS: admin all-event access and nested user/assignment navigation.');

    await evaluate("app.logout();setView('home');refresh();openLogin()");
    await fill('#loginForm', {
      email: 'volleyball-manager@bluecourt.tw',
      password: 'BlueCourt2026!',
    });
    await evaluate("document.getElementById('loginForm').requestSubmit()");
    await until("view==='workspace' && app.current()?.email==='volleyball-manager@bluecourt.tw'");
    assert.deepEqual(
      await evaluate("[...document.querySelector('#event-select').options].map(e=>e.value)"),
      ['volleyball'],
    );
    assert(
      await evaluate(
        "document.getElementById('currentPanel').textContent.includes('大學排球聯賽')",
      ),
    );
    console.log('PASS: dedicated upcoming-event manager can access only the volleyball event.');
    await evaluate("app.logout();setView('home');refresh()");
    await click('[data-command=enroll][data-event=tennis]');
    assert.equal(await evaluate("document.getElementById('loginModal').hidden"), false);
    assert.equal(await evaluate('pendingEnrollment'), 'tennis');
    await send('Page.reload');
    await until(
      "typeof app!=='undefined' && app.db && !document.getElementById('loginModal').hidden",
    );
    assert.equal(await evaluate('pendingEnrollment'), 'tennis');
    await click('#showRegister');
    await fill('#registerForm', {
      name: 'Browser Player',
      email: 'browser@example.com',
      password: 'StrongPassword123',
    });
    await evaluate("document.getElementById('registerForm').requestSubmit()");
    await until("app.current()?.email==='browser@example.com' && view==='enrollment'");
    assert.equal(await evaluate('app.role()'), 'player');
    assert.equal(
      await evaluate("document.querySelector('[data-form=enrollment]').dataset.event"),
      'tennis',
    );
    await fill('[data-form=enrollment]', {
      team: 'Browser Team',
      name: 'Browser Player',
      phone: '0912345678',
      birthday: '2000-01-01',
      emergencyName: 'Family',
      emergencyPhone: '0987654321',
    });
    await evaluate("document.querySelector('[data-form=enrollment]').requestSubmit()");
    await until(
      "view==='workspace' && app.db.entries.some(r=>r.userId===app.current().id && r.eventId==='tennis')",
    );
    assert(
      await evaluate("document.getElementById('currentPanel').textContent.includes('網球積分賽')"),
    );
    await evaluate("setView('home');refresh()");
    await click('[data-command=enroll][data-event=volleyball]');
    assert.equal(await evaluate('view'), 'enrollment');
    await click('[data-command=cancel-enrollment]');
    await click('#accountButton');
    await click('#openProfile');
    assert.equal(await evaluate('view'), 'workspace');
    assert.equal(await evaluate('activeTab'), 'center');
    console.log(
      'PASS: pending event survives reload; registration goes straight to complete enrollment form; logged-in enrollment opens directly.',
    );
    await evaluate("app.logout();setView('home');refresh()");
    await click('[data-command=enroll][data-event=volleyball]');
    await fill('#loginForm', { email: 'other@bluecourt.tw', password: 'BlueCourt2026!' });
    await evaluate("document.getElementById('loginForm').requestSubmit()");
    await until("view==='enrollment'");
    assert.equal(
      await evaluate("document.querySelector('[data-form=enrollment]').dataset.event"),
      'volleyball',
    );
    assert.equal(await evaluate("document.querySelector('[name=phone]').value"), '0912345678');
    await click('[data-command=cancel-enrollment]');
    console.log(
      'PASS: existing account login returns to the selected event with prefilled contact details.',
    );

    // A second real tab receives localStorage changes and preserves a profile draft.
    await login('referee');
    const created = await send('Target.createTarget', { url: 'http://127.0.0.1:' + port });
    let otherSocket;
    try {
      const otherPages = await (await fetch(debugOrigin + '/json')).json();
      const other = otherPages.find((p) => p.id === created.targetId);
      otherSocket = new WebSocket(other.webSocketDebuggerUrl);
      await new Promise((r) => otherSocket.addEventListener('open', r, { once: true }));
      let otherId = 0;
      const waits = new Map();
      otherSocket.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id) {
          const wait = waits.get(msg.id);
          waits.delete(msg.id);
          msg.error ? wait.reject(new Error(JSON.stringify(msg.error))) : wait.resolve(msg.result);
        }
      });
      const evalOther = (expression) =>
        new Promise((resolve, reject) => {
          const id = ++otherId;
          waits.set(id, {
            resolve: (result) => {
              if (result.exceptionDetails) reject(new Error(result.exceptionDetails.text));
              else resolve(result.result.value);
            },
            reject,
          });
          otherSocket.send(
            JSON.stringify({
              id,
              method: 'Runtime.evaluate',
              params: { expression, returnByValue: true, awaitPromise: true },
            }),
          );
        });
      for (let i = 0; i < 100; i++) {
        if (
          await evalOther(
            "typeof app !== 'undefined' && app.db && document.getElementById('appLoading').hidden",
          )
        )
          break;
        await sleep(100);
      }
      await evalOther("setView('public');renderPublic()");
      await click('[data-command=status][data-status=started]');
      await click('[data-command=score][data-side=B][data-measure=points][data-delta="1"]');
      await sleep(300);
      assert.equal(await evalOther("app.match('match-a').scoreB"), 1);
      assert(
        await evalOther(
          "document.getElementById('workspaceContent').textContent.includes('1 : 1')",
        ),
      );
      await evalOther(
        "showWorkspace();activeTab='profile';editingProfile=true;renderWorkspace();document.querySelector('[name=phone]').value='0988000111';document.querySelector('[name=phone]').focus()",
      );
      await click('[data-command=score][data-side=A][data-delta="1"]');
      await sleep(300);
      assert.equal(await evalOther("document.querySelector('[name=phone]').value"), '0988000111');
      console.log('PASS: real cross-tab public score sync and in-progress form preservation.');
    } finally {
      otherSocket?.close();
      await send('Target.closeTarget', { targetId: created.targetId });
    }

    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await login('referee');
    assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(path.join(profile, 'referee-mobile.png'), Buffer.from(shot.data, 'base64'));
    console.log('Mobile screenshot: ' + path.join(profile, 'referee-mobile.png'));
    await evaluate("setView('home');refresh()");
    assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
    const homeShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(path.join(profile, 'home-mobile.png'), Buffer.from(homeShot.data, 'base64'));
    console.log('Home mobile screenshot: ' + path.join(profile, 'home-mobile.png'));
    assert.deepEqual(errors, []);
    console.log('PASS: mobile width and no uncaught browser exceptions.');
  } finally {
    if (socket?.readyState === 1) {
      socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' }));
      socket.close();
    }
    server.close();
    if (browser) await Promise.race([new Promise((r) => browser.once('exit', r)), sleep(3000)]);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
