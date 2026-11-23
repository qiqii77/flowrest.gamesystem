'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async ({ evaluate, send, fill, login, until, profile, press, submit, check }) => {
  const value = (code) => evaluate('(()=>{' + code + '})()');
  async function picture(name) {
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
    fs.writeFileSync(path.join(profile, name + '.png'), Buffer.from(shot.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  await check('項目獨立名額、選手多項報名與審核狀態、自動延遲及完賽灰化', async () => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await login('admin');
    await press('[data-command=tab][data-tab=create]');
    await press('[data-group-action=add]');
    await press('[data-group-action=add]');
    await press('[data-group-definition]:nth-child(4) [data-group-action=remove]');
    await fill('[data-form=event]', {
      name: '項目組別流程測試賽',
      sport: '羽球',
      location: '測試球館',
      date: '2099-06-01',
      deadline: '2099-05-20',
      time: '09:00',
      courts: '2',
      interval: '30',
      locations: '主館｜A1\n主館｜A2',
    });
    await value(
      "const definitions=[['男子單打',1],['女子單打',2],['混合雙打',3]];document.querySelectorAll('[data-group-definition]').forEach((r,i)=>{r.querySelector('[name=groupName]').value=definitions[i][0];r.querySelector('[name=groupCapacity]').value=definitions[i][1]});refreshGroupDefinitions(document.querySelector('[data-group-editor]'));",
    );
    assert.equal(
      await evaluate("document.querySelector('[data-group-editor]').nextElementSibling.type"),
      'submit',
    );
    await picture('event-category-limits-mobile');
    await submit('[data-form=event]');
    const eid = await evaluate('activeEvent');
    assert.deepEqual(await evaluate('app.event(' + JSON.stringify(eid) + ').groupLimits'), {
      男子單打: 1,
      女子單打: 2,
      混合雙打: 3,
    });
    assert.equal(await evaluate("!!document.querySelector('[data-tab=review]')"), false);
    await value('app.assignManager(' + JSON.stringify(eid) + ",'staff@bluecourt.tw');");
    await login('player');
    await press('#brandHome');
    await press('[data-command=enroll][data-event="' + eid + '"]');
    assert.equal(await evaluate("document.querySelector('[name=group]').value"), '男子單打');
    await submit('[data-form=enrollment]');
    const male = await evaluate(
      'app.db.entries.find(r=>r.eventId===' + JSON.stringify(eid) + "&&r.group==='男子單打').id",
    );
    await press('[data-player-event="' + eid + '"] [data-add-group=true]');
    assert.equal(
      await evaluate("document.querySelector('[name=group] option[value=男子單打]').disabled"),
      true,
    );
    assert.equal(await evaluate("document.querySelector('[name=group]').value"), '女子單打');
    await submit('[data-form=enrollment]');
    assert.equal(
      await evaluate(
        'document.querySelectorAll(\'[data-player-event="' +
          eid +
          '"] [data-player-entry]\').length',
      ),
      2,
    );
    assert.deepEqual(
      await evaluate(
        '[...document.querySelectorAll(\'[data-player-event="' +
          eid +
          '"] .entry-status\')].map(e=>e.textContent)',
      ),
      ['審核中', '審核中'],
    );
    await value("app.logout();setView('home');refresh();openLogin();");
    await fill('#loginForm', { email: 'other@bluecourt.tw', password: 'BlueCourt2026!' });
    await press('#submitLogin');
    await until("view==='workspace'");
    await press('#brandHome');
    await press('[data-command=enroll][data-event="' + eid + '"]');
    assert(
      await evaluate(
        "document.querySelector('[name=group] option[value=男子單打]').textContent.includes('名額已滿')",
      ),
    );
    await press('[data-command=cancel-enrollment]');
    await login('manager');
    await press('[data-command=tab][data-tab=review]');
    await value(
      "const s=document.getElementById('event-select');s.value=" +
        JSON.stringify(eid) +
        ";s.dispatchEvent(new Event('change',{bubbles:true}));",
    );
    await press('[data-command=review][data-entry="' + male + '"][data-status=approved]');
    await login('player');
    await press('[data-command=tab][data-tab=entries]');
    assert.equal(
      await evaluate(
        'document.querySelector(\'[data-player-entry="' + male + '"] .entry-status\').textContent',
      ),
      '報名成功',
    );
    assert.equal(
      await evaluate(
        'document.querySelectorAll(\'[data-player-event="' + eid + '"] .entry-pending\').length',
      ),
      1,
    );
    await picture('player-registered-groups-mobile');
    await value(
      "const base=app.match('match-a');app.db.matches.push({...base,id:'auto-finish-ui',eventId:" +
        JSON.stringify(eid) +
        ",group:'男子單打',date:BlueCourtDemo.todayDate(),time:'00:00',status:'pending',locked:false,revision:0,autoDelayed:false,refereeId:'referee',checkedA:true,checkedB:true,scoreA:0,scoreB:0,gamesA:0,gamesB:0,bracket:false,nextMatchId:'',entryA:" +
        JSON.stringify(male) +
        ",entryB:'opponent',teamA:'選手甲',teamB:'選手乙'});app.save();",
    );
    await login('referee');
    await press('[data-referee-action=select][data-match=auto-finish-ui]');
    await value('app.syncScheduleStatus();refreshScheduleBadges();');
    assert.equal(await evaluate("app.match('auto-finish-ui').status"), 'delayed');
    assert(
      await evaluate(
        "document.querySelector('#workspaceContent [data-match-id=auto-finish-ui] [data-match-state]').textContent.includes('延遲')",
      ),
    );
    assert.equal(
      await evaluate("!!document.querySelector('[data-command=status][data-status=delayed]')"),
      false,
    );
    await press('[data-command=status][data-match=auto-finish-ui][data-status=started]');
    await press('[data-referee-corrections] summary');
    await press(
      '[data-command=score][data-match=auto-finish-ui][data-measure=points][data-side=A][data-delta="1"]',
    );
    await press('[data-command=finalize][data-match=auto-finish-ui]');
    await press('#actionModalPrimary');
    assert.equal(
      await evaluate(
        "document.querySelector('#workspaceContent [data-match-id=auto-finish-ui]').classList.contains('match-finished')",
      ),
      true,
    );
    assert.equal(await evaluate("app.match('auto-finish-ui').scoreA"), 1);
    await value("openPublic('schedule'," + JSON.stringify(eid) + ');');
    assert(
      await evaluate(
        "document.querySelector('#workspaceContent [data-match-id=auto-finish-ui]').classList.contains('match-finished')",
      ),
    );
    await picture('finished-schedule-mobile');
    await login('admin');
  });
};
