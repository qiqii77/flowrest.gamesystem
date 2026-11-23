'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async ({ evaluate, send, fill, login, until, profile, press, submit, check }) => {
  const value = (code) => evaluate('(()=>{' + code + '})()');
  async function credentials(email) {
    await value("app.logout();setView('home');refresh();openLogin();");
    await fill('#loginForm', { email, password: 'StaffStart2026!' });
    await press('#submitLogin');
    await until("view==='workspace' && app.current()?.email===" + JSON.stringify(email));
  }
  async function row(index, fields) {
    await fill('[data-staff-row]:nth-child(' + (index + 1) + ')', fields);
    await value(
      "const r=document.querySelectorAll('[data-staff-row]')[" +
        index +
        "];r.querySelector('[name=role]').dispatchEvent(new Event('change',{bubbles:true}));r.querySelector('[name=eventId]').dispatchEvent(new Event('change',{bubbles:true}));",
    );
  }
  await check('圖示來源載入、首頁隱藏返回鍵與批次建帳角色及賽事範圍', async () => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await login('admin');
    assert.equal(
      await evaluate("!!document.querySelector('[data-tab=users],[data-command=admin-role]')"),
      false,
    );
    assert.equal(
      await evaluate("document.getElementById('pageBack').closest('.page-back-bar').hidden"),
      true,
    );
    await press('#brandHome');
    assert.equal(await evaluate("document.getElementById('pageBack').getClientRects().length"), 0);
    await press('#accountButton');
    await press('#openProfile');
    await press('[data-command=tab][data-tab=staff]');
    assert.equal(
      await evaluate("document.getElementById('pageBack').closest('.page-back-bar').hidden"),
      false,
    );
    assert.equal(
      await evaluate("getComputedStyle(document.querySelector('#menuToggle .app-icon')).height"),
      '20px',
    );
    assert(
      await evaluate(
        "getComputedStyle(document.querySelector('#menuToggle .app-icon')).maskImage.includes('/assets/icons/menu.svg')",
      ),
    );
    const assets = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../assets/icons/sources.json'), 'utf8'),
    );
    const loaded = await evaluate(
      'Promise.all(' +
        JSON.stringify(assets.map((a) => 'assets/icons/' + a.file)) +
        ".map(async url=>{const r=await fetch(url);return r.ok&&(await r.text()).includes('<svg')}))",
    );
    assert(loaded.every(Boolean));
    await press('[data-staff-action=mode][data-mode=manual]');
    assert.equal(
      await evaluate("document.querySelector('[data-staff-action=remove]').disabled"),
      true,
    );
    await press('[data-staff-action=add]');
    await press('[data-staff-action=add]');
    await press('[data-staff-row]:nth-child(3) [data-staff-action=remove]');
    assert.equal(await evaluate("document.querySelectorAll('[data-staff-row]').length"), 2);
    await row(0, {
      name: '新排球管理員',
      email: 'batch-manager-ui@example.tw',
      password: 'StaffStart2026!',
      role: 'manager',
      eventId: 'volleyball',
    });
    await row(1, {
      name: '待指派裁判',
      email: 'batch-manager-ui@example.tw',
      password: 'StaffStart2026!',
      role: 'referee',
      eventId: 'volleyball',
    });
    const before = await evaluate('app.db.users.length');
    await submit('[data-form=staff-batch]');
    await until("document.querySelector('[data-batch-error]').textContent.includes('重複')");
    assert.equal(await evaluate('app.db.users.length'), before);
    assert.equal(
      await evaluate("document.querySelector('[data-staff-row] input[name=email]').value"),
      'batch-manager-ui@example.tw',
    );
    await fill('[data-staff-row]:nth-child(2)', { email: 'batch-waiting-ui@example.tw' });
    await press('[data-staff-action=add]');
    await row(2, {
      name: '已指派裁判',
      email: 'batch-assigned-ui@example.tw',
      password: 'StaffStart2026!',
      role: 'referee',
      eventId: 'badminton',
    });
    const mid = await evaluate(
      "app.db.matches.find(m=>m.eventId==='badminton'&&!m.locked&&!m.refereeId).id",
    );
    assert(mid, 'Need an unassigned match in the selected event');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(profile, 'staff-batch-mobile.png'),
      Buffer.from(shot.data, 'base64'),
    );
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await submit('[data-form=staff-batch]');
    await until('!staffBatchBusy && staffBatchResult.length===3');
    assert.equal(await evaluate('app.current().id'), 'admin');
    assert.equal(await evaluate('app.db.users.length'), before + 3);
    assert.equal(
      await evaluate("document.querySelectorAll('.staff-result-list article').length"),
      3,
    );
    assert.equal(
      await evaluate("document.querySelector('[data-staff-row] input[name=password]').value"),
      '',
    );
    assert.equal(await evaluate('app.match(' + JSON.stringify(mid) + ').refereeId'), '');
    await press('[data-staff-action=assign][data-email="batch-assigned-ui@example.tw"]');
    assert.equal(await evaluate('activeSubtab'), 'changes');
    await press('[data-referee-assignment="' + mid + '"] summary');
    assert.equal(
      await evaluate(
        "document.querySelector('[data-form=referee][data-match=" +
          JSON.stringify(mid) +
          "] [name=email]').value",
      ),
      'batch-assigned-ui@example.tw',
    );
    await submit('[data-form=referee][data-match="' + mid + '"]');
    assert.equal(
      await evaluate('app.match(' + JSON.stringify(mid) + ').refereeId'),
      await evaluate("app.db.users.find(u=>u.email==='batch-assigned-ui@example.tw').id"),
    );
    await credentials('batch-waiting-ui@example.tw');
    assert.equal(await evaluate('app.role()'), 'referee');
    assert(
      await evaluate(
        "document.getElementById('workspaceContent').textContent.includes('尚無指派場次')",
      ),
    );
    assert.equal(await evaluate("!!document.querySelector('[data-command=score]')"), false);
    await credentials('batch-assigned-ui@example.tw');
    assert.equal(await evaluate('app.role()'), 'referee');
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('#workspaceContent [data-match-id]')].map(el=>el.dataset.matchId)",
      ),
      [mid],
    );
    await credentials('batch-manager-ui@example.tw');
    assert.equal(await evaluate('app.role()'), 'manager');
    assert.deepEqual(
      await evaluate("[...document.querySelector('#event-select').options].map(o=>o.value)"),
      ['volleyball'],
    );
    assert.equal(
      await evaluate("!!document.querySelector('[data-tab=staff],[data-tab=users]')"),
      false,
    );
    assert.equal(await evaluate('staffExportRows.length'), 0);
    assert.equal(await evaluate("!!document.querySelector('[data-tab=personnel]')"), false);
    await press('[data-command=tab][data-tab=roster]');
    assert(
      await evaluate("document.getElementById('currentPanel').textContent.includes('選手名單')"),
    );
    await login('admin');
  });
  await check('一鍵批次開立、帳密CSV下載、角色登入及登出清除初始密碼', async () => {
    await login('admin');
    await press('[data-command=tab][data-tab=staff]');
    await press('[data-staff-action=mode][data-mode=quick]');
    await fill('[data-form=staff-quick]', {
      role: 'referee',
      eventId: 'volleyball',
      count: '4',
      prefix: 'quickdemo',
    });
    await submit('[data-form=staff-quick]');
    await until('!staffBatchBusy && staffBatchResult.length===4');
    const generated = await evaluate('JSON.parse(JSON.stringify(staffExportRows))');
    assert.equal(generated.length, 4);
    assert.equal(
      await evaluate("document.querySelector('[data-initial-password]').textContent"),
      '••••••••••••',
    );
    for (const r of generated)
      assert(!(await evaluate('JSON.stringify(app.db)')).includes(r.initialPassword));
    await press('[data-staff-action=reveal]');
    assert.equal(
      await evaluate("document.querySelector('[data-initial-password]').textContent"),
      generated[0].initialPassword,
    );
    const downloadPath = path.join(profile, 'downloads');
    fs.mkdirSync(downloadPath, { recursive: true });
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
    await press('[data-staff-action=export]');
    let file;
    for (let i = 0; i < 100; i++) {
      file = fs.readdirSync(downloadPath).find((n) => n.endsWith('.csv'));
      if (file) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert(file, 'CSV must actually download');
    const csv = fs.readFileSync(path.join(downloadPath, file), 'utf8');
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert(csv.includes('所屬賽事') && csv.includes('初始密碼'));
    for (const r of generated)
      assert(csv.includes(r.email) && csv.includes(r.initialPassword) && csv.includes(r.eventName));
    assert.equal(csv.split('\r\n').filter(Boolean).length, 5);
    const escaped = await evaluate(
      "staffCredentialsCsv([{email:'quote@example.tw',initialPassword:'Abc12345!',name:'王\"同學',role:'referee',eventName:'兩行\\n賽事'}])",
    );
    assert(escaped.includes('王""同學'));
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(profile, 'staff-quick-mobile.png'),
      Buffer.from(screenshot.data, 'base64'),
    );
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await press('[data-staff-action=clear]');
    assert.equal(await evaluate('staffExportRows.length'), 0);
    assert.equal(await evaluate("!!document.querySelector('[data-staff-action=export]')"), false);
    await fill('[data-form=staff-quick]', {
      role: 'manager',
      eventId: 'volleyball',
      count: '1',
      prefix: 'quickmgr',
    });
    await submit('[data-form=staff-quick]');
    await until('!staffBatchBusy && staffBatchResult.length===1');
    const manager = await evaluate('({...staffExportRows[0]})');
    await value('window.__staffReloadMarker=true;');
    await send('Page.reload');
    await until(
      "!window.__staffReloadMarker && typeof app!=='undefined' && app.db && document.querySelector('#accountButton.is-signed-in')",
    );
    assert.equal(await evaluate('staffExportRows.length'), 0);
    assert.equal(await evaluate("!!document.querySelector('[data-staff-action=export]')"), false);
    assert(await evaluate('app.db.users.some(u=>u.email===' + JSON.stringify(manager.email) + ')'));
    await value("app.logout();setView('home');refresh();openLogin();");
    assert.equal(await evaluate('staffExportRows.length'), 0);
    assert.equal(await evaluate("!!document.querySelector('.staff-batch-result')"), false);
    await fill('#loginForm', { email: manager.email, password: manager.initialPassword });
    await press('#submitLogin');
    await until("view==='workspace'");
    assert.equal(await evaluate('app.role()'), 'manager');
    assert.deepEqual(await evaluate('app.managedEvents().map(e=>e.id)'), ['volleyball']);
    await press('[data-command=tab][data-tab=roster]');
    assert(await evaluate("document.querySelectorAll('.participant-card').length>0"));
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const rosterShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(
      path.join(profile, 'participant-roster-mobile.png'),
      Buffer.from(rosterShot.data, 'base64'),
    );
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await value("app.logout();setView('home');refresh();openLogin();");
    await fill('#loginForm', { email: generated[0].email, password: generated[0].initialPassword });
    await press('#submitLogin');
    await until("view==='workspace'");
    assert.equal(await evaluate('app.role()'), 'referee');
    assert(
      await evaluate(
        "document.getElementById('workspaceContent').textContent.includes('尚無指派場次')",
      ),
    );
    await login('admin');
  });
};
