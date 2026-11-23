/* Public navigation and management information regressions. */
'use strict';
const assert = require('node:assert/strict');
module.exports = async function ({ evaluate: rawEvaluate, click, fill, login, until, send }) {
  const evaluate = (code) =>
    rawEvaluate(code.startsWith('const ') ? '(()=>{' + code + '})()' : code);
  await login('manager');
  await click('[data-command=tab][data-tab=info]');
  const original = await evaluate("JSON.parse(JSON.stringify(app.event('badminton')))");
  const values = {
    name: original.name,
    location: '測試綜合體育館',
    date: original.date,
    time: original.time,
    deadline: original.deadline,
    organizer: 'BlueCourt 示範協會',
    address: '臺北市示範路 1 號',
    contactName: '賽務窗口',
    contactEmail: 'staff@bluecourt.tw',
    contactPhone: '0912345678',
    introduction: '第一段賽事介紹\n第二段說明',
    eligibility: '依報名組別參賽',
    rules: '三戰兩勝',
    fees: '每隊 500 元',
    refunds: '開賽前七日可申請退費',
    notices: '請提前 30 分鐘報到',
  };
  await fill('[data-form=event-info]', values);
  await evaluate("document.querySelector('[data-form=event-info]').requestSubmit()");
  assert.equal(await evaluate("app.event('badminton').info.organizer"), values.organizer);
  await click('[data-command=event-detail][data-event=badminton]');
  assert.equal(await evaluate('view'), 'event');
  assert.equal(await evaluate('location.hash'), '#event/badminton');
  assert(
    await evaluate(
      "document.getElementById('workspaceContent').textContent.includes('第二段說明')",
    ),
  );
  await click('#pageBack');
  await until("view==='workspace' && activeTab==='info'");
  await click('#pageBack');
  await until("view==='workspace' && activeTab==='overview'");
  await click('[data-command=tab][data-tab=changes]');
  await click('[data-referee-assignment] summary');
  assert.equal(
    await evaluate("!!document.querySelector('[data-form=referee] select[name=email]')"),
    false,
  );
  await evaluate(
    "const i=document.querySelector('[data-form=referee] input[name=email]');i.value='player';i.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  assert(
    await evaluate(
      "document.querySelector('.account-search-results').textContent.includes('player@bluecourt.tw')",
    ),
  );
  await click('[data-account-email="player@bluecourt.tw"]');
  assert.equal(
    await evaluate("document.querySelector('[data-form=referee] input[name=email]').value"),
    'player@bluecourt.tw',
  );
  await login('admin');
  await click('[data-command=tab][data-tab=info]');
  await evaluate(
    "const i=document.querySelector('[data-event-lookup]');i.value='排球';i.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  assert.deepEqual(
    await evaluate(
      "[...document.querySelector('#event-select').options].map(o=>o.value).filter(Boolean)",
    ),
    ['volleyball'],
  );
  assert.equal(await evaluate("document.querySelector('#event-select').value"), '');
  await evaluate(
    "const i=document.querySelector('#event-select');i.value='volleyball';i.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  assert.equal(
    await evaluate("document.querySelector('[data-form=event-info]').dataset.event"),
    'volleyball',
  );
  await click('[data-command=tab][data-tab=events]');
  await click('[data-command=tab][data-tab=staff]');
  await click('[data-staff-assignment-panel] summary');
  assert.equal(
    await evaluate("document.querySelector('[data-form=manager] input[name=email]').type"),
    'text',
  );
  assert.equal(
    await evaluate("!!document.querySelector('[data-form=manager] select[name=email]')"),
    false,
  );
  await click('#brandHome');
  assert.equal(
    await evaluate("!!document.querySelector('#eventGrid button[data-command=event-detail]')"),
    false,
  );
  assert(
    await evaluate(
      "[...document.querySelectorAll('#homeScheduleList [data-match-id]')].every(el=>app.match(el.dataset.matchId).date===BlueCourtDemo.todayDate())",
    ),
  );
  await click('[data-public-tab=schedule]');
  await evaluate(
    "const i=document.querySelector('[data-workspace-search]');i.value='不存在的隊伍';i.dispatchEvent(new Event('input',{bubbles:true}))",
  );
  assert.equal(await evaluate("document.querySelector('[data-search-empty]').hidden"), false);
  await click('[data-command=clear-workspace-search]');
  assert(await evaluate("document.querySelectorAll('[data-search-item]:not([hidden])').length>0"));
  await evaluate(
    "app.db.matches.forEach(m=>{if(m.status==='finished')m.date=BlueCourtDemo.offsetDate(BlueCourtDemo.todayDate(),-1);else m.date=BlueCourtDemo.offsetDate(BlueCourtDemo.todayDate(),5)});renderHome()",
  );
  assert(await evaluate("document.querySelectorAll('#homeScheduleList [data-match-id]').length>0"));
  assert(
    await evaluate(
      "[...document.querySelectorAll('#homeScheduleList [data-match-id]')].every(el=>app.match(el.dataset.matchId).status==='finished')",
    ),
  );
  await evaluate('app.load();renderHome()');
  await click('[data-command=home-events]');
  await click('[data-command=event-detail][data-event=badminton]');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  await evaluate('window.__navigationReloadCheck=true;location.reload()');
  await until(
    "!window.__navigationReloadCheck && typeof view !== 'undefined' && view==='event' && eventDetailId==='badminton'",
  );
  await click('#pageBack');
  await until("view==='home'");
  await evaluate('history.forward()');
  await until("view==='event' && eventDetailId==='badminton'");
  console.log(
    'PASS: event information save/scope, dedicated URL reload, back history, account search, event lookup, schedule search and recent finished fallback.',
  );
};
