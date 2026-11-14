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
    assert.equal(
      await evaluate("document.querySelectorAll('.nav-dropdown [data-open-role]').length"),
      0,
    );
    await click('#menuToggle');
    await click('.nav-dropdown [data-event-filter=open]');
    assert.equal(await evaluate("document.querySelectorAll('#eventGrid .event-card').length"), 2);
    await click('#menuToggle');
    await click('.nav-dropdown [data-event-filter=upcoming]');
    assert.equal(await evaluate("document.querySelectorAll('#eventGrid .event-card').length"), 1);
    await click('[data-filter=all]');
    console.log('PASS: redundant home management links removed; quick event filters work.');
    await click('[data-public-tab]');
    assert.equal(await evaluate('view'), 'public');
    console.log(
      'PASS: guest public schedule without login; unified account login without visible role choices.',
    );

    await evaluate("setView('home');openLogin()");
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('[data-social-login]')].map(b=>b.dataset.socialLogin)",
      ),
      ['LINE', 'Google', 'Facebook'],
    );
    assert.equal(await evaluate("document.getElementById('openProfile').textContent"), '個人中心');
    await click('[data-social-login=LINE]');
    assert(
      await evaluate(
        "document.getElementById('socialLoginStatus').textContent.includes('LINE 帳號連動尚未開放')",
      ),
    );
    assert.equal(await evaluate('app.current()'), null);
    await click('[data-social-login=Google]');
    assert(
      await evaluate(
        "document.getElementById('socialLoginStatus').textContent.includes('Google 帳號連動尚未開放')",
      ),
    );
    await click('[data-social-login=Facebook]');
    assert(await evaluate("document.getElementById('socialLoginStatus').textContent.includes('Facebook 帳號連動尚未開放')"));
    assert.equal(await evaluate('app.current()'), null);
    await evaluate('closeLogin()');
    console.log(
      'PASS: personal-center label, LINE/Google/Facebook entries, and clear unavailable status without creating a session.',
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
    await click('[data-command=tab][data-tab=forms]');
    assert.equal(await evaluate("document.querySelector('#event-select').options.length"), 3);
    assert(await evaluate("!!document.querySelector('[data-form=registration-settings]')"));
    await click('[data-command=preview-schema]');
    assert(
      await evaluate("document.getElementById('actionModalBody').textContent.includes('繳費資訊')"),
    );
    await evaluate('closeModal()');

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
    await click('[data-command=tab][data-tab=forms]');
    await fill('[data-form=registration-settings]', {
      groups: '公開組、校友組',
      paymentMode: 'planned',
      paymentAmount: '600',
      paymentNote: '繳費功能尚未開放，請等待主辦通知。',
    });
    await evaluate(
      "document.querySelector('[name=paymentMode]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[name=paymentMethods][value=bank_transfer]').checked=true",
    );
    await click('[data-command=add-schema-field]');
    const customId = await evaluate(
      "document.querySelector('#schemaFields').lastElementChild.dataset.fieldId",
    );
    await evaluate(
      "(()=>{const r=document.querySelector('#schemaFields').lastElementChild;r.querySelector('.schema-label').value='衣服尺寸';const t=r.querySelector('.schema-type');t.value='select';t.dispatchEvent(new Event('change',{bubbles:true}));r.querySelector('.schema-options').value='S、M、L';r.querySelector('.schema-required').checked=true;})()",
    );
    await click('[data-command=add-schema-field]');
    const branchId = await evaluate(
      "document.querySelector('#schemaFields').lastElementChild.dataset.fieldId",
    );
    await evaluate(
      "const row=document.querySelector('#schemaFields').lastElementChild;row.querySelector('.schema-label').value='隊伍補充資料';row.querySelector('.schema-type').value='textarea';row.querySelector('.schema-type').dispatchEvent(new Event('change',{bubbles:true}))",
    );
    await click('.schema-row.active [data-command=schema-panel][data-panel=answer]');
    await click('.schema-row.active .schema-required');
    await click('.schema-row.active [data-command=schema-panel][data-panel=conditions]');
    await click('.schema-row.active .condition-enabled');
    await evaluate("document.querySelector('.schema-row.active .condition-value').value='校友組'");
    await click('.schema-row.active [data-command=add-condition]');
    await evaluate(
      "const rule=document.querySelector('.schema-row.active .condition-rules').lastElementChild;rule.querySelector('.condition-field').value=" +
        JSON.stringify(customId) +
        ";rule.querySelector('.condition-value').value='M'",
    );
    await fill('[data-form=registration-settings]', {
      externalName: '示範繳費入口',
      externalPurpose: 'payment',
      externalUrl: 'https://example.com/payment',
      externalNote: '依主辦說明處理，付款結果不會自動同步。',
    });
    await evaluate("document.querySelector('[name=externalEnabled]').checked=true");
    assert(
      await evaluate(
        "document.querySelector('.schema-outline').textContent.includes('有顯示條件')",
      ),
    );
    const conditionShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(profile, 'conditional-form-editor.png'),
      Buffer.from(conditionShot.data, 'base64'),
    );
    await click('[data-command=preview-schema]');
    assert(
      await evaluate("document.getElementById('actionModalBody').textContent.includes('衣服尺寸')"),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.schema-preview [data-applicant-field=" + branchId + "]').hidden",
      ),
      true,
    );
    await evaluate(
      "const group=document.querySelector('.schema-preview [name=group]');group.value='校友組';group.dispatchEvent(new Event('change',{bubbles:true}))",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.schema-preview [data-applicant-field=" + branchId + "]').hidden",
      ),
      true,
    );
    await evaluate(
      "const sizeCheck1=document.querySelector('.schema-preview [name=" +
        customId +
        "]');sizeCheck1.value='M';sizeCheck1.dispatchEvent(new Event('change',{bubbles:true}))",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.schema-preview [data-applicant-field=" + branchId + "]').hidden",
      ),
      false,
    );
    assert.equal(
      await evaluate("document.querySelector('.schema-preview .external-system a').target"),
      '_blank',
    );
    assert.equal(await evaluate("BlueCourtForms.getConfig(app.event('volleyball')).revision"), 0);
    await evaluate(
      "closeModal();document.querySelector('[data-form=registration-settings]').requestSubmit()",
    );
    assert.equal(await evaluate("BlueCourtForms.getConfig(app.event('volleyball')).revision"), 1);
    assert(await evaluate("app.event('volleyball').groups.includes('校友組')"));
    console.log(
      'PASS: admin form tab, event-scoped field editor, draft preview, custom required select, and reserved payment configuration.',
    );

    await evaluate("app.logout();setView('home');refresh()");
    await click('[data-command=enroll][data-event=tennis]');
    assert.equal(await evaluate("document.getElementById('loginModal').hidden"), false);
    assert.equal(await evaluate('pendingEnrollment'), 'tennis');
    await send('Page.reload');
    await until(
      "typeof app!=='undefined' && app.db && !document.getElementById('loginModal').hidden",
    );
    assert.equal(await evaluate('pendingEnrollment'), 'tennis');
    await click('[data-social-login=LINE]');
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

    assert(
      await evaluate(
        "document.getElementById('enrollmentContent').textContent.includes('衣服尺寸')",
      ),
    );
    assert(
      await evaluate(
        "document.getElementById('enrollmentContent').textContent.includes('NT$ 600')",
      ),
    );
    assert.equal(
      await evaluate("document.querySelector('[data-form=enrollment]').checkValidity()"),
      false,
    );
    await fill('[data-form=enrollment]', {
      group: '校友組',
      [customId]: 'M',
      paymentMethod: 'bank_transfer',
    });
    await evaluate(
      "document.querySelector('[data-form=enrollment] [name=group]').dispatchEvent(new Event('change',{bubbles:true}))",
    );
    assert.equal(
      await evaluate("document.querySelector('[data-applicant-field=" + branchId + "]').hidden"),
      false,
    );
    assert.equal(
      await evaluate("document.querySelector('[name=" + branchId + "]').required"),
      true,
    );
    assert.equal(
      await evaluate("document.querySelector('[data-form=enrollment]').checkValidity()"),
      false,
    );
    await fill('[data-form=enrollment]', {
      [branchId]: '完整隊伍備註：第一行\n第二行，供管理員在審核視窗查看。',
    });
    await evaluate(
      "const sizeCheck2=document.querySelector('[name=" +
        customId +
        "]');sizeCheck2.value='S';sizeCheck2.dispatchEvent(new Event('change',{bubbles:true}))",
    );
    assert.equal(
      await evaluate("document.querySelector('[name=" + branchId + "]').disabled"),
      true,
    );
    await evaluate(
      "const sizeCheck3=document.querySelector('[name=" +
        customId +
        "]');sizeCheck3.value='M';sizeCheck3.dispatchEvent(new Event('change',{bubbles:true}))",
    );
    assert.equal(
      await evaluate("document.querySelector('[name=" + branchId + "]').disabled"),
      false,
    );
    await evaluate("document.querySelector('[data-form=enrollment]').requestSubmit()");
    await until("view==='workspace'");
    assert(
      await evaluate("document.getElementById('currentPanel').textContent.includes('衣服尺寸')"),
    );
    assert.equal(
      await evaluate(
        "app.db.entries.find(r=>r.userId===app.current().id&&r.eventId==='volleyball').payment.status",
      ),
      'not_connected',
    );
    console.log(
      'PASS: configured fields and payment reservation reach the application; submitted answer snapshot appears in personal center without paid status.',
    );

    const applicationId = await evaluate(
      "app.db.entries.find(r=>r.userId===app.current().id&&r.eventId==='volleyball').id",
    );
    await evaluate("app.logout();setView('home');refresh();openLogin()");
    await fill('#loginForm', {
      email: 'volleyball-manager@bluecourt.tw',
      password: 'BlueCourt2026!',
    });
    await evaluate("document.getElementById('loginForm').requestSubmit()");
    await until("view==='workspace'");
    await click('[data-command=tab][data-tab=review]');
    const reviewSelector = '[data-command=open-registration][data-entry="' + applicationId + '"]';
    assert.equal(
      await evaluate(
        'document.querySelector(' +
          JSON.stringify(reviewSelector) +
          ").textContent.includes('第二行')",
      ),
      false,
    );
    await click(reviewSelector);
    assert.equal(await evaluate("document.getElementById('actionModal').hidden"), false);
    assert(
      await evaluate("document.getElementById('actionModalBody').textContent.includes('第二行')"),
    );
    assert(
      await evaluate(
        "document.getElementById('actionModalBody').textContent.includes('隊伍補充資料')",
      ),
    );
    await click('#actionModalBody [data-command=review][data-status=approved]');
    assert(
      await evaluate(
        "document.querySelector('.review-detail-meta').textContent.includes('已核准')",
      ),
    );
    const reviewShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(profile, 'registration-review-dialog.png'),
      Buffer.from(reviewShot.data, 'base64'),
    );
    await evaluate('closeModal()');
    assert.equal(await evaluate('document.activeElement.dataset.entry'), applicationId);
    console.log(
      'PASS: conditional editor and interactive preview, hidden-required switching, external link and review dialog approval.',
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
      await login('manager');
      await click('[data-command=tab][data-tab=forms]');
      await click('[data-command=add-schema-field]');
      await evaluate(
        "const r=document.querySelector('#schemaFields').lastElementChild;r.querySelector('.schema-label').value='未儲存的隊伍備註';const f=document.querySelector('[data-form=registration-settings]');f.elements.paymentMode.value='planned';f.elements.paymentMode.dispatchEvent(new Event('change',{bubbles:true}));f.elements.paymentAmount.value='350';f.querySelector('[name=paymentMethods][value=bank_transfer]').checked=true;r.querySelector('.schema-label').focus()",
      );
      await sleep(200);
      await evalOther("app.load();app.updateStream('badminton','https://www.youtube.com/')");
      await sleep(300);
      assert.equal(
        await evaluate(
          "document.querySelector('#schemaFields').lastElementChild.querySelector('.schema-label').value",
        ),
        '未儲存的隊伍備註',
      );
      assert.equal(
        await evaluate("document.querySelector('[data-payment-details]').hidden"),
        false,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('[name=paymentMethods][value=bank_transfer]').checked",
        ),
        true,
      );
      assert.equal(await evaluate('document.activeElement.value'), '未儲存的隊伍備註');
      console.log(
        'PASS: cross-tab updates preserve unsaved schema rows, payment settings and field focus.',
      );
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

    await login('admin');
    await click('[data-command=tab][data-tab=forms]');
    assert(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'));
    const formShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(profile, 'form-management-mobile.png'),
      Buffer.from(formShot.data, 'base64'),
    );
    console.log('Form management screenshot: ' + path.join(profile, 'form-management-mobile.png'));
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
