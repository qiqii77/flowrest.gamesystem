/* Real pointer-driven audit. Runs inside the isolated browser test profile. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function audit({ evaluate, send, fill, login, until, profile, popupUrls }) {
  let pointerClicks = 0;
  const steps = [],
    pause = (ms) => new Promise((r) => setTimeout(r, ms));
  async function press(selector) {
    await evaluate(
      `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&!el.closest('[hidden]'));if(!el)throw new Error('Missing control: '+${JSON.stringify(selector)});el.scrollIntoView({block:'center',inline:'center',behavior:'instant'});})()`,
    );
    await pause(20);
    const point =
      await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.getClientRects().length&&!el.closest('[hidden]'));if(el.matches(':disabled'))throw new Error('Disabled control: '+${JSON.stringify(selector)});
      const r=el.getBoundingClientRect(),x=Math.max(1,Math.min(innerWidth-2,r.x+r.width/2)),y=Math.max(1,Math.min(innerHeight-2,r.y+r.height/2)),hit=document.elementFromPoint(x,y);
      if(!r.width||!r.height||!el.contains(hit))throw new Error('Not clickable or covered: '+${JSON.stringify(selector)}+' by '+(hit?hit.tagName+'#'+hit.id+'.'+String(hit.className):'none'));
      return {x,y};})()`);
    pointerClicks++;
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      clickCount: 1,
    });
    await pause(30);
  }
  async function check(label, fn) {
    await fn();
    steps.push(label);
    console.log('AUDIT PASS: ' + label);
  }
  const value = (code) => evaluate('(()=>{' + code + '})()');
  const submit = (selector) =>
    press(selector + ' button[type=submit],' + selector + ' button:not([type])');
  async function signOut() {
    await value('closeModal();closeLogin();clearEnrollment();');
    if (await evaluate('!!app.current()')) {
      await press('#accountButton');
      await press('#menuSignOut');
    }
    assert.equal(await evaluate('app.current()'), null);
  }
  async function signIn(mail) {
    await signOut();
    await press('#accountButton');
    await fill('#loginForm', { email: mail, password: 'BlueCourt2026!' });
    await press('#submitLogin');
    await until("view==='workspace'");
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    "(async()=>{closeModal();closeLogin();clearEnrollment();app.logout();setView('home');localStorage.removeItem(BlueCourt.KEY);app.db=null;await app.init();refresh();})()",
  );
  await evaluate(
    "document.head.insertAdjacentHTML('beforeend','<style>html{scroll-behavior:auto!important}*{transition:none!important;animation:none!important}</style>')",
  );
  await check('首頁主導覽、所有下拉連結、篩選、排序與外部直播', async () => {
    for (const id of ['home', 'live', 'events', 'schedule']) {
      await press('.primary-nav [href="#' + id + '"]');
      assert.equal(
        await evaluate(
          "document.querySelector('.primary-nav [aria-current=location]').getAttribute('href')",
        ),
        '#' + id,
      );
    }
    await value(
      "document.querySelectorAll('#navDropdown a').forEach((a,n)=>a.dataset.auditLink=String(n));",
    );
    const links = await evaluate("[...document.querySelectorAll('#navDropdown a')].map((a,i)=>i)");
    for (const i of links) {
      await press('#menuToggle');
      await press('#navDropdown [data-audit-link="' + i + '"]');
    }
    for (const key of ['all', 'live', 'upcoming', 'open']) await press('[data-filter=' + key + ']');
    await press('[data-filter=all]');
    await value(
      "const el=document.getElementById('eventSort');for(const mode of ['soonest','popular','recommended']){el.value=mode;el.dispatchEvent(new Event('change',{bubbles:true}));}",
    );
    await value(
      "document.getElementById('eventSearch').value='不存在的賽事';document.getElementById('eventSearch').dispatchEvent(new Event('input',{bubbles:true}));",
    );
    assert.equal(await evaluate("document.getElementById('emptyResults').hidden"), false);
    await value(
      "document.getElementById('eventSearch').value='';document.getElementById('eventSearch').dispatchEvent(new Event('input',{bubbles:true}));",
    );
    const before = (await send('Target.getTargets')).targetInfos.map((t) => t.targetId),
      count = popupUrls.length;
    await press('#heroScore a.live-preview');
    await pause(150);
    assert(popupUrls.slice(count).includes('https://www.youtube.com/'));
    for (const t of (await send('Target.getTargets')).targetInfos.filter(
      (t) => t.type === 'page' && !before.includes(t.targetId),
    ))
      await send('Target.closeTarget', { targetId: t.targetId });
  });
  await check('未報名賽事資訊保留賽事範圍，今日與完整賽程切換', async () => {
    await press('[data-command=event-detail][data-event=badminton]');
    assert.equal(await evaluate('view'), 'event');
    await press('#workspaceContent [data-command=today-live]');
    assert.equal(await evaluate('publicEvent'), 'badminton');
    assert.equal(await evaluate('publicTab'), 'live');
    await press('[data-command=all-schedule]');
    assert.equal(await evaluate('publicTab'), 'schedule');
    assert.equal(await evaluate('publicEvent'), 'badminton');
    await press('[data-command=today-live]');
    await press('[data-command=home-events]');
    await press('[data-public-tab=schedule]');
    assert.equal(await evaluate('publicEvent'), '');
    assert.equal(await evaluate('publicTab'), 'schedule');
    await press('[data-command=home-events]');
    await value("const e=app.event('tennis');e.registrationOpen=false;app.save();");
    await press('[data-command=event-detail][data-event=tennis]');
    await press('#workspaceContent [data-command=all-schedule]');
    assert.equal(await evaluate('publicEvent'), 'tennis');
    assert.equal(await evaluate('publicTab'), 'schedule');
    await press('[data-command=home-events]');
    await value("app.event('tennis').registrationOpen=true;app.save();");
  });
  await check('登入取消、關閉、背景點擊、註冊返回與三種第三方入口提示', async () => {
    await press('#accountButton');
    await press('[data-close-modal]');
    assert.equal(await evaluate('document.activeElement.id'), 'accountButton');
    await press('#accountButton');
    for (const name of ['LINE', 'Google', 'Facebook']) {
      await press('[data-social-login=' + name + ']');
      assert(
        await evaluate(
          "document.getElementById('socialLoginStatus').textContent.includes(" +
            JSON.stringify(name) +
            ')',
        ),
      );
    }
    await press('#showRegister');
    assert.equal(await evaluate('view'), 'register');
    await press('#registrationLogin');
    await press('#loginModalBrand');
    assert.equal(await evaluate('view'), 'home');
    await press('#accountButton');
    await press('#showRegister');
    await press('#registrationBrandHome');
    assert.equal(await evaluate('view'), 'home');
    await press('#accountButton');
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 5,
      y: 5,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 5,
      y: 5,
      button: 'left',
      clickCount: 1,
    });
    assert.equal(await evaluate("document.getElementById('loginModal').hidden"), true);
    await press('#accountButton');
    await press('#showRegister');
    await fill('#registerForm', {
      name: '原生按鈕註冊者',
      email: 'button-audit@example.com',
      password: 'ButtonAudit2026!',
    });
    await press('#registerForm button[type=submit]');
    await until("view==='workspace'");
    assert.equal(await evaluate('app.current().email'), 'button-audit@example.com');
    await signOut();
  });
  await check('選手四個分頁、個人資料取消與儲存、報名取消及重複報名導向', async () => {
    await signIn('player@bluecourt.tw');
    for (const tab of ['center', 'schedule', 'entries', 'profile']) {
      await press('[data-command=tab][data-tab=' + tab + ']');
      assert.equal(await evaluate('activeTab'), tab);
    }
    await press('[data-command=edit-profile]');
    await press('[data-command=cancel-profile]');
    assert.equal(await evaluate('editingProfile'), false);
    await press('[data-command=edit-profile]');
    await fill('[data-form=profile]', { name: '按鈕檢查選手', phone: '0912345678' });
    await submit('[data-form=profile]');
    assert.equal(await evaluate('app.current().name'), '按鈕檢查選手');
    await press('[data-command=tab][data-tab=entries]');
    await press('[data-command=home-events]');
    await press('[data-command=enroll][data-event=tennis]');
    await press('[data-command=cancel-enrollment]');
    assert.equal(await evaluate('view'), 'home');
    await press('[data-command=event-detail][data-event=tennis]');
    await press('#workspaceContent [data-command=enroll]');
    await submit('[data-form=enrollment]');
    await until("view==='workspace'");
    await press('#brandHome');
    await press('[data-command=enroll][data-event=tennis]');
    assert.equal(await evaluate('activeTab'), 'entries');
    await press('#brandHome');
    await press('#accountButton');
    await press('#openProfile');
    assert.equal(await evaluate('activeTab'), 'center');
    await press('#accountButton');
    await press('[data-command=tab][data-tab=profile]');
    assert.equal(await evaluate("document.getElementById('accountMenu').hidden"), true);
  });
  await check('裁判報到、開始／延後／取消、大小比分、歸零、送出與修正請求', async () => {
    await signIn('referee@bluecourt.tw');
    await press('[data-command=tab][data-tab=profile]');
    await press('[data-command=tab][data-tab=scoreboard]');
    await press('[data-checkin][data-side=A]');
    await press('[data-checkin][data-side=B]');
    for (const status of ['cancelled', 'started']) {
      await press('[data-command=status][data-status=' + status + ']');
      assert.equal(await evaluate("app.match('match-a').status"), status);
    }
    await press('[data-referee-corrections] summary');
    for (const measure of ['points', 'games'])
      for (const side of ['A', 'B']) {
        await press(
          '[data-command=score][data-measure=' +
            measure +
            '][data-side=' +
            side +
            '][data-delta="1"]',
        );
        await press(
          '[data-command=score][data-measure=' +
            measure +
            '][data-side=' +
            side +
            '][data-delta="-1"]',
        );
      }
    await press('[data-command=score][data-measure=points][data-side=A][data-delta="1"]');
    await press('[data-command=reset]');
    await press('#actionModal [data-action-close]');
    assert.equal(await evaluate("app.match('match-a').scoreA"), 1);
    await press('[data-command=reset]');
    await press('#actionModalPrimary');
    assert.equal(await evaluate("app.match('match-a').scoreA"), 0);
    await press('[data-command=score][data-measure=games][data-side=A][data-delta="1"]');
    await press('[data-command=reset-all]');
    await press('#actionModalPrimary');
    assert.equal(await evaluate("app.match('match-a').gamesA"), 0);
    await press('[data-command=score][data-measure=points][data-side=A][data-delta="1"]');
    await press('[data-command=finish-game]');
    await press('#actionModalPrimary');
    await press('[data-command=finalize]');
    await press('#actionModalPrimary');
    assert.equal(await evaluate("app.match('match-a').locked"), true);
    await press('[data-command=correction]');
    await value("document.getElementById('correctionReason').value='按鈕逐步檢查的修正請求';");
    await press('#actionModalPrimary');
  });
  await check('管理員全部分頁、解鎖、賽程儲存、直播網址與裁判指派', async () => {
    await signIn('staff@bluecourt.tw');
    for (const tab of ['overview', 'changes', 'review', 'roster', 'forms', 'profile']) {
      await press('[data-command=tab][data-tab=' + tab + ']');
      assert.equal(await evaluate('activeTab'), tab);
    }
    await press('[data-command=tab][data-tab=changes]');
    await press('[data-command=unlock][data-match=match-a]');
    await value("document.getElementById('correctionReason').value='已核對比分';");
    await press('#actionModalPrimary');
    await fill('[data-form=match][data-match=match-a]', {
      venue: '按鈕測試館',
      court: '中央 A 場',
      time: '09:30',
    });
    await submit('[data-form=match][data-match=match-a]');
    assert.equal(await evaluate("app.match('match-a').court"), '中央 A 場');
    await press('[data-command=tab][data-tab=overview]');
    await press('.stream-settings summary');
    await fill('[data-form=stream]', { streamUrl: 'https://www.youtube.com/' });
    await submit('[data-form=stream]');
    await press('[data-command=group-filter][data-group="女子單打"]');
    await press('[data-command=group-filter][data-group=""]');
    await press('[data-command=tab][data-tab=changes]');
    await press('[data-referee-assignment="demo-match-0-0-4"] summary');
    await fill('[data-form=referee][data-match="demo-match-0-0-4"]', {
      email: 'other@bluecourt.tw',
    });
    await submit('[data-form=referee][data-match="demo-match-0-0-4"]');
    assert.equal(await evaluate("app.match('demo-match-0-0-4').refereeId"), 'other');
  });
  await check('表單題目選取／分頁、複製／刪除／上下移動、顯示條件新增移除與預覽儲存', async () => {
    await press('[data-command=tab][data-tab=forms]');
    assert.equal(
      await evaluate(
        "document.querySelector('.schema-row.active [data-command=move-schema-up]').disabled",
      ),
      true,
    );
    await press('[data-command=add-schema-field]');
    const id = await evaluate("document.querySelector('.schema-row.active').dataset.fieldId");
    await press('.schema-row.active [data-command=duplicate-schema-field]');
    assert.equal(await evaluate("document.querySelectorAll('[data-schema-row]').length"), 10);
    await press('.schema-row.active [data-command=remove-schema-field]');
    assert.equal(await evaluate("document.querySelectorAll('[data-schema-row]').length"), 9);
    await press('[data-command=select-schema-field][data-field="' + id + '"]');
    await press('.schema-row.active [data-command=move-schema-up]');
    await press('.schema-row.active [data-command=move-schema-down]');
    assert.equal(
      await evaluate(
        "document.querySelector('.schema-row.active [data-command=move-schema-down]').disabled",
      ),
      true,
    );
    await press('.schema-row.active [data-command=schema-panel][data-panel=answer]');
    await press('.schema-row.active .schema-required');
    await press('.schema-row.active [data-command=schema-panel][data-panel=conditions]');
    await press('.schema-row.active .condition-enabled');
    await press('.schema-row.active [data-command=add-condition]');
    await press('.schema-row.active [data-command=remove-condition]');
    await press('.schema-row.active .condition-enabled');
    await press('.schema-row.active [data-command=schema-panel][data-panel=content]');
    await fill('[data-form=registration-settings]', {
      externalName: '外部連結檢查',
      externalUrl: 'https://example.com/payment',
    });
    await press('[name=externalEnabled]');
    await press('[data-command=preview-schema]');
    const before = (await send('Target.getTargets')).targetInfos.map((t) => t.targetId),
      count = popupUrls.length;
    await press('#actionModal .external-system a');
    await pause(150);
    assert(popupUrls.slice(count).includes('https://example.com/payment'));
    for (const target of (await send('Target.getTargets')).targetInfos.filter(
      (t) => t.type === 'page' && !before.includes(t.targetId),
    ))
      await send('Target.closeTarget', { targetId: target.targetId });
    await press('#actionModal .action-modal-footer [data-action-close]');
    await submit('[data-form=registration-settings]');
    assert.equal(await evaluate("app.event('badminton').registrationForm.revision"), 1);
    await press('#brandHome');
    await press('[data-command=enroll][data-event=tennis]');
    await submit('[data-form=enrollment]');
    await until("!document.getElementById('actionModal').hidden");
    assert(
      await evaluate(
        "document.getElementById('actionModalTitle').textContent.includes('我的報名資料')",
      ),
    );
    await press('#actionModal [data-action-close]');
    await press('#brandHome');
    await press('[data-command=enroll][data-event=tennis]');
    assert(
      await evaluate(
        "document.getElementById('actionModalTitle').textContent.includes('我的報名資料')",
      ),
    );
    await press('#actionModal [data-action-close]');
  });
  await check('系統管理員全部分頁與細項、建立賽事與賽事管理員指派移除', async () => {
    await signIn('admin@bluecourt.tw');
    for (const tab of ['events', 'create', 'forms', 'info', 'staff', 'profile']) {
      await press('[data-command=tab][data-tab=' + tab + ']');
      assert.equal(await evaluate('activeTab'), tab);
    }
    await press('[data-command=tab][data-tab=events]');
    for (const tab of ['summary', 'changes', 'roster', 'audit']) {
      await press('[data-command=subtab][data-tab=' + tab + ']');
      assert.equal(await evaluate('activeSubtab'), tab);
    }
    assert.equal(
      await evaluate("!!document.querySelector('[data-command=subtab][data-tab=review]')"),
      false,
    );
    await press('[data-command=tab][data-tab=events]');
    await press('[data-command=tab][data-tab=staff]');
    if (!(await evaluate("document.querySelector('[data-staff-assignment-panel]').open")))
      await press('[data-staff-assignment-panel]>summary');
    await value(
      "const el=document.querySelector('[data-staff-manager-event]');el.value='tennis';el.dispatchEvent(new Event('change',{bubbles:true}));",
    );
    await fill('[data-form=manager]', { email: 'other@bluecourt.tw', operation: 'add' });
    await submit('[data-form=manager]');
    assert(await evaluate("app.event('tennis').managers.includes('other')"));
    await fill('[data-form=manager]', { email: 'other@bluecourt.tw', operation: 'remove' });
    await submit('[data-form=manager]');
    assert(!(await evaluate("app.event('tennis').managers.includes('other')")));
    await press('[data-command=tab][data-tab=create]');
    await fill('[data-form=event]', {
      name: '按鈕流程示範賽',
      sport: '羽球',
      location: '測試運動館',
      date: '2099-05-20',
      deadline: '2099-05-18',
      time: '09:00',
      courts: '2',
      interval: '40',
      locations: '主館｜中央場\n副館｜東場',
      streamUrl: 'https://www.youtube.com/',
    });
    await value(
      "const row=document.querySelector('[data-form=event] [data-group-definition]');row.querySelector('[name=groupName]').value='公開組';row.querySelector('[name=groupCapacity]').value='16';",
    );
    await press(
      '[data-form=event] [data-group-definition]:nth-child(2) [data-group-action=remove]',
    );
    await submit('[data-form=event]');
    assert.equal(await evaluate('activeTab'), 'events');
    assert.equal(await evaluate('app.event(activeEvent).name'), '按鈕流程示範賽');
    await press('[data-command=close-registration]');
    await press('#actionModal [data-action-close]');
    assert.equal(await evaluate('app.event(activeEvent).registrationOpen'), true);
    await press('[data-command=close-registration]');
    await press('#actionModalPrimary');
    assert.equal(await evaluate('app.event(activeEvent).registrationOpen'), false);
  });
  await check('賽事管理員及系統管理員三頁搜尋、範圍隔離、草稿保留與狀態更新', async () => {
    async function query(text) {
      await press('[data-workspace-search]');
      await value('document.activeElement.select();');
      await send('Input.insertText', { text });
      await pause(30);
    }
    for (const role of ['manager', 'admin']) {
      await signIn(role === 'manager' ? 'staff@bluecourt.tw' : 'admin@bluecourt.tw');
      async function page(kind) {
        if (role === 'admin') {
          await press('[data-command=tab][data-tab=events]');
          await press('[data-command=subtab][data-tab=' + kind + ']');
        } else
          await press(
            '[data-command=tab][data-tab=' +
              { changes: 'changes', review: 'review', roster: 'roster' }[kind] +
              ']',
          );
        if ((await evaluate('activeEvent')) !== 'badminton')
          await value(
            "const el=document.getElementById('event-select');el.value='badminton';el.dispatchEvent(new Event('change',{bubbles:true}));",
          );
      }
      await page('changes');
      await value(
        "window.searchDraft=document.querySelector('[data-form=match][data-match=match-a] [name=venue]');window.searchDraft.value='尚未儲存草稿';",
      );
      await query('王立晨 按鈕測試館');
      assert.equal(
        await evaluate(
          "document.querySelectorAll('[data-search-item]:not([hidden]) [data-form=match]').length",
        ),
        1,
      );
      await query('完全不存在的搜尋結果');
      assert.equal(await evaluate("document.querySelector('[data-search-empty]').hidden"), false);
      await press('[data-command=clear-workspace-search]');
      assert(
        await evaluate(
          "window.searchDraft===document.querySelector('[data-form=match][data-match=match-a] [name=venue]')",
        ),
      );
      assert.equal(await evaluate('window.searchDraft.value'), '尚未儲存草稿');
      assert.equal(
        await evaluate("document.querySelector('[data-command=clear-workspace-search]').disabled"),
        true,
      );

      if (role === 'manager') {
        await page('review');
        await query('ｐｌａｙｅｒ＠ｂｌｕｅｃｏｕｒｔ．ｔｗ');
        assert.equal(
          await evaluate(
            "document.querySelectorAll('[data-search-item]:not([hidden]) .review-card-open').length",
          ),
          1,
        );
        await query('demo-tennis-user-0@example.test');
        assert.equal(await evaluate("document.querySelector('[data-search-empty]').hidden"), false);
        await press('[data-command=clear-workspace-search]');
      }
      await page('roster');
      assert.equal(await evaluate("!!document.querySelector('[data-tab=personnel]')"), false);
      await query('PLAYER@BLUECOURT.TW');
      assert.equal(
        await evaluate(
          "document.querySelectorAll('[data-search-item]:not([hidden]) .participant-card').length",
        ),
        1,
      );
      await press('[data-search-item]:not([hidden]) [data-roster-entry]');
      assert(
        await evaluate(
          "document.getElementById('actionModalBody').textContent.includes('player@bluecourt.tw')",
        ),
      );
      assert.equal(
        await evaluate("!!document.querySelector('#actionModalBody [data-command=review]')"),
        false,
      );
      await press('#actionModal .action-modal-footer [data-action-close]');
      await query('demo-tennis-user-0@example.test');
      assert.equal(await evaluate("document.querySelector('[data-search-empty]').hidden"), false);
      await press('[data-command=clear-workspace-search]');
    }
    await value("app.assignManager('tennis','staff@bluecourt.tw');");
    await signIn('staff@bluecourt.tw');
    await press('[data-command=tab][data-tab=review]');
    await query('player@bluecourt.tw');
    await value(
      "const el=document.getElementById('event-select');el.value='tennis';el.dispatchEvent(new Event('change',{bubbles:true}));",
    );
    assert.equal(await evaluate("document.querySelector('[data-workspace-search]').value"), '');
    await value(
      "const el=document.getElementById('event-select');el.value='badminton';el.dispatchEvent(new Event('change',{bubbles:true}));",
    );
    assert.equal(
      await evaluate("document.querySelector('[data-workspace-search]').value"),
      'player@bluecourt.tw',
    );
    await press('[data-command=clear-workspace-search]');

    await value(
      "const el=document.getElementById('event-select');el.value='tennis';el.dispatchEvent(new Event('change',{bubbles:true}));",
    );
    await query('待審核');
    const entryId = await evaluate(
      "document.querySelector('[data-search-item]:not([hidden]) .review-card-open').dataset.entry",
    );
    const beforeCount = await evaluate(
      "document.querySelectorAll('[data-search-item]:not([hidden]) .review-card-open').length",
    );
    await press('[data-command=open-registration][data-entry="' + entryId + '"]');
    await press('#actionModalBody [data-command=review][data-status=approved]');
    assert.equal(
      await evaluate("document.querySelector('[data-workspace-search]').value"),
      '待審核',
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('[data-search-item]:not([hidden]) .review-card-open').length",
      ),
      beforeCount - 1,
    );
    await press('#actionModal .action-modal-footer [data-action-close]');
    assert.equal(await evaluate("document.activeElement.matches('[data-workspace-search]')"), true);
    await press('[data-command=clear-workspace-search]');
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
      path.join(profile, 'management-search-mobile.png'),
      Buffer.from(shot.data, 'base64'),
    );
  });
  await require('./event-groups.cjs')({
    evaluate,
    send,
    fill,
    login,
    until,
    profile,
    press,
    submit,
    check,
  });
  await require('./staff-accounts.cjs')({
    evaluate,
    send,
    fill,
    login,
    until,
    profile,
    press,
    submit,
    check,
  });
  await require('./referee-scoring.cjs')({
    evaluate,
    send,
    fill,
    login,
    until,
    profile,
    press,
    submit,
    check,
  });
  await check('手機選單實際觸控及全部連結目標檢查', async () => {
    await press('#brandHome');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await press('#menuToggle');
    await press('#navDropdown [data-event-filter=open]');
    assert.equal(
      await evaluate("document.getElementById('navDropdown').getAttribute('aria-hidden')"),
      'true',
    );
    await press('#accountButton');
    await press('#openProfile');
    assert.equal(await evaluate('view'), 'workspace');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const missing = await evaluate(
      "[...document.querySelectorAll('a[href^=\"#\"]')].map(a=>a.getAttribute('href')).filter(href=>href.length>1&&!document.querySelector(href))",
    );
    assert.deepEqual(missing, []);
  });
  const expected = [
    ...fs
      .readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8')
      .split('async function runCommand')[1]
      .split("document.addEventListener('click'")[0]
      .matchAll(/case '([^']+)'/g),
  ].map((m) => m[1]);
  const seen = await evaluate('[...window.__nativeButtonAuditCommands]');
  const missing = expected.filter((command) => !seen.includes(command));
  assert.deepEqual(missing, [], 'Unverified rendered command handlers');
  const report = {
    pointerClicks,
    steps,
    commandCount: new Set(expected).size,
    commands: seen,
    unavailable: [
      'LINE / Google / Facebook: 明確提示尚未開放第三方授權',
      '繳費: 預留方式與外部連結，尚未串接扣款',
    ],
    result: 'passed',
  };
  fs.writeFileSync(path.join(profile, 'button-audit-report.json'), JSON.stringify(report, null, 2));
  console.log(
    'AUDIT PASS: ' +
      steps.length +
      ' workflow groups; all ' +
      report.commandCount +
      ' command handlers exercised via ' +
      pointerClicks +
      ' real pointer clicks. Report: ' +
      path.join(profile, 'button-audit-report.json'),
  );
};
