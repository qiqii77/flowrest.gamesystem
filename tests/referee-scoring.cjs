'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async ({ evaluate, send, fill, login, until, profile, press, submit, check }) => {
  const value = (code) => evaluate('(()=>{' + code + '})()');
  const mid = 'referee-video-regression';
  const action = (name, extra = '') =>
    '[data-referee-action="' + name + '"][data-match="' + mid + '"]' + extra;
  const rally = (side) => press(action('rally', '[data-winner=' + side + ']'));
  const call = () => evaluate("BlueCourtPickleball.call(app.match('" + mid + "'))");
  async function shot(name, width = 390) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 760,
    });
    await value("window.scrollTo({top:0,behavior:'instant'});");
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    const image = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    fs.writeFileSync(path.join(profile, name + '.png'), Buffer.from(image.data, 'base64'));
  }
  await check('影片匹克球雙打：先發站位、逐球換發、暫停復原、換邊及雙方確認鎖定', async () => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await login('admin');
    await value(
      "const m={...app.match('match-a'),id:'" +
        mid +
        "',refereeId:'referee',teamA:'青川雙打隊',teamB:'海嶼雙打隊',group:'匹克球混合雙打',venue:'青川運動中心',court:'中央 1 號場',date:BlueCourtDemo.todayDate(),time:'14:00',checkedA:false,checkedB:false,status:'pending',locked:false,revision:0,scoreA:0,scoreB:0,gamesA:0,gamesB:0,gameHistory:[],bracket:false,nextMatchId:'',winnerSide:'',refereeState:undefined,completedAt:undefined};app.db.matches.push(m);app.save();",
    );
    await login('referee');
    await press(action('select'));
    assert.equal(
      await evaluate(
        "document.querySelector('[data-command=status][data-status=started]').disabled",
      ),
      true,
    );
    await fill('[data-form=referee-setup]', {
      playerA1: '林青',
      playerA2: '王川',
      playerB1: '陳海',
      playerB2: '李嶼',
      target: '15',
      bestOf: '1',
      nearTeam: 'B',
    });
    await press('[data-checkin][data-side=A]');
    assert.equal(await evaluate("document.querySelector('[name=playerA1]').value"), '林青');
    await press('[data-checkin][data-side=B]');
    await press(action('toss'));
    assert(await evaluate("['A','B'].includes(document.querySelector('[name=tossWinner]').value)"));
    await fill('[data-form=referee-setup]', { tossWinner: 'B', tossChoice: 'receive' });
    await value(
      "document.querySelector('[name=tossChoice]').dispatchEvent(new Event('change',{bubbles:true}));",
    );
    assert.equal(await evaluate("document.querySelector('[name=servingTeam]').value"), 'A');
    await shot('referee-pickleball-setup-mobile');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await press('[data-command=status][data-match="' + mid + '"][data-status=started]');
    assert.deepEqual(await call(), [0, 0, 2]);
    assert.equal(
      await evaluate(
        "document.querySelector('[data-court-team=A] [data-server=true] strong').textContent",
      ),
      '林青',
    );
    await rally('A');
    assert.deepEqual(await call(), [1, 0, 2]);
    assert.equal(
      await evaluate("document.querySelector('[data-server=true]').dataset.courtSlot"),
      'left',
    );
    assert.equal(
      await evaluate("document.querySelector('[data-receiver=true] strong').textContent"),
      '李嶼',
    );
    await rally('B');
    assert.deepEqual(await call(), [0, 1, 1]);
    await rally('B');
    await rally('B');
    assert.deepEqual(await call(), [2, 1, 1]);
    await rally('A');
    assert.deepEqual(await call(), [2, 1, 2]);
    await rally('A');
    assert.deepEqual(await call(), [1, 2, 1]);
    assert.equal(
      await evaluate("document.querySelector('[data-server=true] strong').textContent"),
      '王川',
    );
    await press(action('undo'));
    assert.deepEqual(await call(), [2, 1, 2]);
    await rally('A');
    assert.deepEqual(await call(), [1, 2, 1]);
    await press(action('timeout', '[data-team=A]'));
    assert.equal(
      await evaluate("document.querySelector('[data-referee-action=rally]').disabled"),
      true,
    );
    assert.equal(await evaluate("app.match('" + mid + "').refereeState.timeouts.A"), 1);
    await press(action('undo'));
    assert.equal(await evaluate("app.match('" + mid + "').refereeState.paused"), false);
    assert.equal(await evaluate("app.match('" + mid + "').refereeState.timeouts.A"), 0);
    await press(action('pause'));
    await press(action('resume'));
    await press(action('swap-ends'));
    assert.equal(await evaluate("app.match('" + mid + "').refereeState.nearTeam"), 'A');
    assert.deepEqual(await call(), [1, 2, 1]);
    await press(action('undo'));
    await press('[data-referee-corrections] summary');
    await fill('[data-form=referee-serve]', { team: 'B', number: '2', player: '0', court: 'left' });
    await submit('[data-form=referee-serve]');
    assert.equal(
      await evaluate("document.querySelector('[data-server=true] strong').textContent"),
      '陳海',
    );
    await press(action('undo'));
    assert.deepEqual(await call(), [1, 2, 1]);
    await press('[data-referee-corrections] summary');
    await value('window.__refereeReloadMarker=true;location.reload();');
    await until(
      "!window.__refereeReloadMarker && typeof view!=='undefined' && view==='workspace' && document.getElementById('appLoading').hidden",
    );
    assert.equal(await evaluate('selectedRefereeMatchId'), mid);
    assert.deepEqual(await call(), [1, 2, 1]);
    assert.equal(
      await evaluate("document.querySelector('[data-server=true] strong').textContent"),
      '王川',
    );
    for (let i = 0; i < 7; i++) await rally('A');
    assert.equal(await evaluate("app.match('" + mid + "').scoreA"), 8);
    assert.equal(await evaluate("app.match('" + mid + "').refereeState.nearTeam"), 'A');
    assert.equal(
      await evaluate("document.querySelector('[data-server=true] strong').textContent"),
      '王川',
    );
    await shot('referee-pickleball-desktop', 1280);
    await shot('referee-pickleball-mobile');
    await press('[data-referee-action=toggle-list]');
    assert.equal(
      await evaluate(
        "document.querySelector('[data-referee-action=toggle-list]').getAttribute('aria-expanded')",
      ),
      'true',
    );
    await press(action('select'));
    assert.equal(
      await evaluate(
        "document.querySelector('[data-referee-action=toggle-list]').getAttribute('aria-expanded')",
      ),
      'false',
    );
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (let i = 0; i < 7; i++) await rally('A');
    assert.equal(await evaluate("app.match('" + mid + "').refereeState.matchWinner"), 'A');
    assert.equal(await evaluate("app.match('" + mid + "').gamesA"), 1);
    await press('[data-command=finalize][data-match="' + mid + '"]');
    assert.equal(await evaluate("document.getElementById('actionModalPrimary').disabled"), true);
    await press('#refereeScoreAgreement');
    await press('#actionModalPrimary');
    assert.equal(await evaluate("app.match('" + mid + "').locked"), true);
    assert.equal(
      await evaluate("document.getElementById('refereeDesk').classList.contains('match-finished')"),
      true,
    );
    assert.equal(
      await evaluate("document.querySelector('[data-referee-action=rally]').disabled"),
      true,
    );
    await shot('referee-pickleball-finished-mobile');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await press('[data-command=correction][data-match="' + mid + '"]');
    await value(
      "document.getElementById('correctionReason').value='請協助核對最後一球與發球順序';",
    );
    await press('#actionModalPrimary');
    assert(
      await evaluate(
        "app.db.audit.some(row=>row.target==='" + mid + "'&&row.action.includes('比分修正'))",
      ),
    );
    await value(
      "const m={...app.match('referee-video-regression'),id:'referee-series-regression',checkedA:true,checkedB:true,status:'pending',locked:false,revision:0,scoreA:14,scoreB:0,gamesA:0,gamesB:0,gameHistory:[],refereeState:undefined,completedAt:undefined};app.db.matches.push(m);app.save();",
    );
    await press('[data-referee-action=select][data-match=referee-series-regression]');
    await fill('[data-form=referee-setup]', {
      target: '15',
      bestOf: '3',
      servingTeam: 'A',
      nearTeam: 'B',
    });
    await press('[data-command=status][data-match=referee-series-regression][data-status=started]');
    await press('[data-referee-action=rally][data-match=referee-series-regression][data-winner=A]');
    assert.equal(
      await evaluate("app.match('referee-series-regression').refereeState.gameWinner"),
      'A',
    );
    await press('[data-referee-action=next-game][data-match=referee-series-regression]');
    assert.equal(
      await evaluate("app.match('referee-series-regression').refereeState.servingTeam"),
      'B',
    );
    assert.deepEqual(
      await evaluate("BlueCourtPickleball.call(app.match('referee-series-regression'))"),
      [0, 0, 2],
    );
    assert.equal(await evaluate("app.match('referee-series-regression').gamesA"), 1);
    await login('admin');
  });
};
