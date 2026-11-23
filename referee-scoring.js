'use strict';
let selectedRefereeMatchId = '';
let refereeMatchListExpanded = false;
const refereeSetupDrafts = new Map();
const refereeCorrectionOpen = new Set();
function refereeKey(mid) {
  return (app.current()?.id || '') + ':' + mid;
}
function refereeDefaults(m) {
  const state = m.refereeState;
  return (
    refereeSetupDrafts.get(refereeKey(m.id)) || {
      target: state?.target || (Math.max(m.scoreA, m.scoreB) >= 15 ? 21 : 15),
      bestOf: state?.bestOf || 1,
      servingTeam: state?.servingTeam || 'A',
      nearTeam: state?.nearTeam || 'B',
      firstA: state?.firstServers?.A ?? 0,
      firstB: state?.firstServers?.B ?? 0,
      players: state?.players || { A: ['', ''], B: ['', ''] },
      tossWinner: state?.tossWinner || '',
      tossChoice: state?.tossChoice || 'serve',
    }
  );
}
function readRefereeSetup(form) {
  const data = Object.fromEntries(new FormData(form));
  return {
    target: Number(data.target),
    bestOf: Number(data.bestOf),
    servingTeam: data.servingTeam,
    nearTeam: data.nearTeam,
    firstA: Number(data.firstA),
    firstB: Number(data.firstB),
    tossWinner: data.tossWinner,
    tossChoice: data.tossChoice,
    players: {
      A: [data.playerA1 || '', data.playerA2 || ''],
      B: [data.playerB1 || '', data.playerB2 || ''],
    },
  };
}
function refereePlayerName(m, side, index) {
  return m.refereeState?.players?.[side]?.[index] || side + (index + 1);
}
function refereeButton(m, label, action, attrs = '', iconName = '', style = 'secondary-button') {
  return `<button type="button" class="${style}" data-referee-action="${action}" data-match="${h(m.id)}" data-revision="${m.revision}" ${attrs}>${iconName ? icon(iconName) : ''}<span>${h(label)}</span></button>`;
}
function refereeSetupForm(m) {
  const d = refereeDefaults(m),
    teamOptions = [
      ['A', m.teamA],
      ['B', m.teamB],
    ];
  return `<form class="referee-setup" data-form="referee-setup" data-match="${h(m.id)}" data-revision="${m.revision}">
 <div class="referee-flow" aria-label="賽前流程"><span class="${m.checkedA && m.checkedB ? 'is-done' : 'is-current'}">01 報到核對</span><span>02 擲幣選擇</span><span>03 先發與場邊</span><span>04 逐球計分</span></div>
 <section class="referee-setup-section"><div class="referee-section-title"><span class="referee-step-number">01</span><div><h3>報到與選手核對</h3><p>核對隊伍及選手資料，確認雙方到場。</p></div></div>
 <div class="referee-lineup-grid">${['A', 'B']
   .map(
     (
       side,
     ) => `<fieldset class="referee-lineup"><legend><span class="referee-team-tag">${side}</span> ${h(m['team' + side])}</legend>
 ${field(side + '1 姓名（選填）', 'player' + side + '1', d.players[side][0], 'text', 'maxlength="100" placeholder="可填入選手姓名"')}
 ${field(side + '2 姓名（選填）', 'player' + side + '2', d.players[side][1], 'text', 'maxlength="100" placeholder="可填入選手姓名"')}
 <label class="referee-arrival"><input type="checkbox" data-checkin="${h(m.id)}" data-side="${side}" ${m['checked' + side] ? 'checked' : ''} ${m.status === 'started' ? 'disabled' : ''}>全隊已到場，且已核對資料</label></fieldset>`,
   )
   .join('')}</div>
 <p class="muted-copy">未填姓名時，以 A1、A2、B1、B2 辨識站位。</p></section>
 <section class="referee-setup-section"><div class="referee-section-title"><span class="referee-step-number">02</span><div><h3>擲幣／猜拳結果</h3><p>記錄勝方選擇，再確認另一方的先發或場邊。</p></div></div>
 <div class="form-grid"><label class="form-field">擲幣勝方<select name="tossWinner">${options([['', '尚未記錄'], ...teamOptions], d.tossWinner)}</select></label>
 <label class="form-field">勝方選擇<select name="tossChoice">${options(
   [
     ['serve', '先發球'],
     ['receive', '先接發'],
     ['end', '選擇場邊'],
     ['defer', '讓對方先選'],
   ],
   d.tossChoice,
 )}</select></label></div>
 ${refereeButton(m, '隨機擲幣', 'toss', '', 'shuffle', 'text-button')}</section>
 <section class="referee-setup-section"><div class="referee-section-title"><span class="referee-step-number">03</span><div><h3>先發球員與起始場邊</h3><p>採用匹克球雙打發球方得分制，開局呼分為 0–0–2。</p></div></div>
 <div class="form-grid"><label class="form-field">先發球方<select name="servingTeam" required>${options(teamOptions, d.servingTeam)}</select></label>
 <label class="form-field">近端隊伍（畫面下方）<select name="nearTeam" required>${options(teamOptions, d.nearTeam)}</select></label>
 ${['A', 'B']
   .map(
     (side) =>
       `<label class="form-field">${side} 隊零分時的右區球員<select name="first${side}">${options(
         [0, 1].map((i) => [i, d.players[side][i] || side + (i + 1)]),
         d['first' + side],
       )}</select></label>`,
   )
   .join('')}
 <label class="form-field">每局目標分數<select name="target">${options(
   [
     [11, '11 分'],
     [15, '15 分'],
     [21, '21 分'],
   ],
   d.target,
 )}</select></label>
 <label class="form-field">比賽局制<select name="bestOf">${options(
   [
     [1, '一局決勝'],
     [3, '三局兩勝'],
     [5, '五局三勝'],
   ],
   d.bestOf,
 )}</select></label></div>
 <div class="referee-rules-note">${icon('info')} <span>須領先 2 分。本場以匹克球雙打計分；決勝局在目標分數一半向上取整時自動換邊，發球員不變。</span></div>
 ${m.scoreA || m.scoreB ? '<p class="muted-copy">本場已有比分 ' + m.scoreA + ' : ' + m.scoreB + '，將保留原分數；請核對發球與站位，必要時可在修正區調整。</p>' : ''}
 <div class="referee-setup-footer">${button('確認設定並開始', 'status', `data-match="${h(m.id)}" data-status="started" ${!m.checkedA || !m.checkedB ? 'disabled' : ''}`, 'primary-button', 'play')}
 ${button('取消本場', 'status', `data-match="${h(m.id)}" data-status="cancelled"`, 'text-button')}</div></section></form>`;
}
function refereeRallyButton(m, side) {
  const s = m.refereeState,
    serving = s.servingTeam === side;
  const disabled = m.locked || m.status !== 'started' || s.paused || s.gameWinner;
  const effect = serving
    ? '得分 +1 · 發球員左右換位'
    : s.serverNumber === 1
      ? '換第二位發球員 · 比分不變'
      : '換發球權 Side out · 比分不變';
  return `<button type="button" class="referee-rally-button ${serving ? 'is-serving' : ''}" data-referee-action="rally" data-match="${h(m.id)}" data-winner="${side}" data-revision="${m.revision}" ${disabled ? 'disabled' : ''}><span class="referee-team-tag">${side}</span><span><strong>${h(m['team' + side])} 贏得這一球</strong><small>${h(effect)}</small></span>${icon(serving ? 'plus' : 'arrow-right')}</button>`;
}
function refereeCourtHalf(m, side, far) {
  const s = m.refereeState,
    receive = BlueCourtPickleball.receiver(s),
    serveCourt = BlueCourtPickleball.serverCourt(s);
  const order = far ? ['right', 'left'] : ['left', 'right'];
  return `<section class="referee-court-half ${far ? 'is-far' : 'is-near'}" data-court-team="${side}"><div class="referee-court-team"><strong>${side} · ${h(m['team' + side])}</strong><span>${far ? '遠端' : '近端'}</span></div><div class="referee-player-grid">${order
    .map((court) => {
      const player = s.positions[side][court],
        server = s.servingTeam === side && s.serverPlayer === player,
        receiver = receive.side === side && receive.player === player;
      return `<div class="referee-player-cell ${server ? 'is-server' : receiver ? 'is-receiver' : ''}" data-court-slot="${court}" data-player-index="${player}" data-server="${server}" data-receiver="${receiver}">
 <span class="referee-court-label">本方${court === 'right' ? '右' : '左'}區</span>${icon('user-round')}<strong>${h(refereePlayerName(m, side, player))}</strong><span class="referee-player-role">${server ? '發球 ' + s.serverNumber : receiver ? '接發球' : '站位'}</span></div>`;
    })
    .join('')}</div></section>`;
}
function refereeScoringPanel(m) {
  const s = m.refereeState,
    far = s.nearTeam === 'A' ? 'B' : 'A',
    call = BlueCourtPickleball.call(m),
    disabled = m.locked || m.status !== 'started';
  return `<section class="referee-score-panel" aria-label="匹克球雙打裁判席">
 <div class="referee-scoreboard"><div class="referee-scoreboard-top"><span>${icon('circle')} ${m.locked ? '比分已鎖定' : s.paused ? '比賽暫停' : s.gameWinner ? '本局結束' : '即時呼分'}</span><span>第 ${m.gameHistory.length + (s.gameWinner ? 0 : 1)} 局 · ${s.target} 分 · ${s.bestOf} 局制</span></div>
 <div class="referee-score-call" aria-label="發球方得分、接發方得分、發球序">${call.map((n, i) => `<span>${n}<small>${['發球方', '接發方', '發球序'][i]}</small></span>`).join('<b aria-hidden="true">–</b>')}</div>
 <div class="referee-score-teams"><span><b>A</b> ${h(m.teamA)} <strong>${m.scoreA}</strong></span><span><b>B</b> ${h(m.teamB)} <strong>${m.scoreB}</strong></span></div>
 <div class="referee-game-score"><span>局數（大比分）</span><strong>${m.gamesA} : ${m.gamesB}</strong><span>發球：${h(refereePlayerName(m, s.servingTeam, s.serverPlayer))}</span></div></div>
 <p class="referee-last-action" role="status">${icon('check')} ${h(s.lastAction)}</p>
 ${s.paused ? `<div class="referee-paused" role="status">${icon('pause')}<div><strong>${s.pause?.team ? h(m['team' + s.pause.team]) + ' 申請暫停' : '裁判暫停比賽'}</strong><p>${s.pause?.kind === 'timeout' ? '<time data-referee-timeout data-at="' + s.pause.at + '"></time>' : '恢復比賽後才可繼續記分。'}</p></div>${refereeButton(m, '恢復比賽', 'resume', '', 'play', 'primary-button')}</div>` : ''}
 ${refereeRallyButton(m, far)}
 <div class="referee-court" aria-label="雙打站位與發球權">${refereeCourtHalf(m, far, true)}<div class="referee-court-net"><span>NET</span></div>${refereeCourtHalf(m, s.nearTeam, false)}</div>
 ${refereeRallyButton(m, s.nearTeam)}
 <div class="referee-control-bar">${refereeButton(m, '復原上一操作', 'undo', `${disabled || !s.history.length ? 'disabled' : ''}`, 'rotate-ccw')}
 ${refereeButton(m, s.paused ? '恢復比賽' : '暫停', s.paused ? 'resume' : 'pause', `${disabled || s.gameWinner ? 'disabled' : ''}`, s.paused ? 'play' : 'pause')}
 ${refereeButton(m, '交換場邊', 'swap-ends', `${disabled || s.gameWinner ? 'disabled' : ''} title="只交換場地兩端，不變更發球權與比分"`, 'arrow-up-down')}</div>
 <div class="referee-timeout-grid">${['A', 'B'].map((side) => refereeButton(m, m['team' + side] + ' 暫停（剩 ' + (BlueCourtPickleball.timeoutLimit(s) - s.timeouts[side]) + '）', 'timeout', `data-team="${side}" ${disabled || s.paused || s.gameWinner || s.timeouts[side] >= BlueCourtPickleball.timeoutLimit(s) ? 'disabled' : ''}`, 'timer')).join('')}</div>
 ${
   s.gameWinner && !m.locked
     ? `<div class="referee-game-result"><span>${icon('trophy')}</span><div><h3>${h(m['team' + s.gameWinner])} 贏得本局</h3><p>${m.scoreA} : ${m.scoreB} · ${s.matchWinner ? '已達勝局數，請與雙方確認後送出。' : '本局已記錄，下一局交換場邊與先發球權。'}</p></div>
 ${s.matchWinner ? button('確認比賽結果', 'finalize', `data-match="${h(m.id)}"`, 'primary-button') : refereeButton(m, '開始下一局', 'next-game', '', 'play', 'primary-button')}</div>`
     : ''
 }
 ${m.locked ? `<div class="referee-locked-note">${icon('lock-keyhole')}<div><strong>已確認結束 · 比分已鎖定</strong><p>如需更動，請填寫原因送交賽事管理員。</p></div>${button('申請更正', 'correction', `data-match="${h(m.id)}"`)}</div>` : ''}
 ${m.status !== 'started' && !m.locked ? '<div class="inline-actions">' + button('恢復本場比賽', 'status', `data-match="${h(m.id)}" data-status="started"`, 'primary-button') + '</div>' : ''}
 </section>`;
}
function refereeManualPanel(m) {
  const disabled = m.locked || m.status !== 'started' || m.refereeState?.paused ? 'disabled' : '',
    key = refereeKey(m.id),
    s = m.refereeState;
  return `<details class="referee-corrections" data-referee-corrections="${h(key)}" ${refereeCorrectionOpen.has(key) ? 'open' : ''}><summary>${icon('sliders-horizontal')} 發球／站位與比分修正</summary>
 <p class="muted-copy">正常比賽請使用「贏得這一球」。手動補登會清除復原紀錄，請同步核對發球員與站位。</p>
 ${
   s?.configured
     ? `<form class="workflow-form referee-serve-form" data-form="referee-serve" data-match="${h(m.id)}" data-revision="${m.revision}"><fieldset class="referee-correction-fields" ${disabled}><div class="form-grid">
 <label class="form-field">發球方<select name="team">${options(
   [
     ['A', m.teamA],
     ['B', m.teamB],
   ],
   s.servingTeam,
 )}</select></label>
 <label class="form-field">發球序<select name="number">${options(
   [
     [1, '第一發球員'],
     [2, '第二發球員'],
   ],
   s.serverNumber,
 )}</select></label>
 <label class="form-field">發球員<select name="player">${options(
   [
     [0, '該隊球員 1'],
     [1, '該隊球員 2'],
   ],
   s.serverPlayer,
 )}</select></label>
 <label class="form-field">發球區<select name="court">${options(
   [
     ['left', '本方左區'],
     ['right', '本方右區'],
   ],
   BlueCourtPickleball.serverCourt(s),
 )}</select></label></div>
 <button class="secondary-button" type="submit" ${disabled}>確認修正發球</button></fieldset></form>`
     : ''
 }
 <div class="flip-scoreboard" aria-label="手動比分補登"><div class="scoreboard-caption">本局得分與局數修正</div><div class="flip-scoreboard-main">
 ${scoreColumn(m, 'A', 'points', disabled)}<div class="games-counters"><span>局數（大比分）</span><div class="games-pair">${scoreColumn(m, 'A', 'games', disabled)}${scoreColumn(m, 'B', 'games', disabled)}</div></div>${scoreColumn(m, 'B', 'points', disabled)}</div>
 <div class="scoreboard-teams"><strong>${h(m.teamA)}</strong><strong>${h(m.teamB)}</strong></div></div>
 <div class="inline-actions">${button('本局得分歸零', 'reset', `data-match="${h(m.id)}" ${disabled}`)}${button('全部比分歸零', 'reset-all', `data-match="${h(m.id)}" ${disabled}`)}
 ${button('記錄本局並開始下一局', 'finish-game', `data-match="${h(m.id)}" ${disabled}`)}${button('結束並送出比分', 'finalize', `data-match="${h(m.id)}" ${disabled}`)}
 ${m.locked ? button('請求管理員修正', 'correction', `data-match="${h(m.id)}"`) : button('取消本場', 'status', `data-match="${h(m.id)}" data-status="cancelled"`, 'text-button')}</div></details>`;
}
function refereeWorkspaceView(matches) {
  if (!matches.length)
    return (
      heading('裁判工作台', '我的指派場次') + empty('目前尚無指派場次，請等候賽事管理員安排。')
    );
  if (!matches.some((m) => m.id === selectedRefereeMatchId)) {
    const saved = sessionStorage.getItem('bluecourt-referee-match-' + app.current().id);
    selectedRefereeMatchId = matches.some((m) => m.id === saved) ? saved : matches[0].id;
  }
  const m = matches.find((m) => m.id === selectedRefereeMatchId),
    e = app.event(m.eventId);
  return `<div class="referee-workspace"><aside class="referee-match-sidebar ${matches.length === 1 ? 'is-single' : ''} ${refereeMatchListExpanded ? 'is-expanded' : ''}"><div class="referee-match-sidebar-heading"><h2>我的場次 <span>${matches.length}</span></h2><button type="button" class="text-button referee-match-toggle" data-referee-action="toggle-list" aria-expanded="${refereeMatchListExpanded}">切換場次 ${icon('chevron-down')}</button></div><div class="referee-match-list">${matches.map((match) => `<button type="button" data-referee-action="select" data-match="${h(match.id)}" class="referee-match-item ${match.id === m.id ? 'is-selected' : ''}" aria-pressed="${match.id === m.id}"><span class="referee-match-time">${h(match.date)} · ${h(match.time)}</span><strong>${h(match.teamA)}<span>vs</span>${h(match.teamB)}</strong><small>${h(match.group)} · ${h(match.venue)} · ${h(match.court)}</small><span data-referee-match-status="${h(match.id)}">${statusBadge(match)}</span></button>`).join('')}</div></aside>
 <article id="refereeDesk" class="competition-card referee-desk ${m.refereeState?.configured ? 'referee-live-desk' : ''} ${m.status === 'finished' ? 'match-finished' : ''}" data-match-id="${h(m.id)}">
 <header class="referee-desk-heading"><div><p class="section-kicker">裁判席 · 匹克球雙打</p><h2>${h(m.teamA)} <span>vs</span> ${h(m.teamB)}</h2><p>${h(e.name)} · ${h(m.group)}</p><div class="referee-match-meta"><span>${icon('calendar-days')} ${h(m.date)} ${h(m.time)}</span><span>${icon('map-pin')} ${h(m.venue)} · ${h(m.court)}</span></div></div>${statusBadge(m)}</header>
 ${m.refereeState?.configured ? refereeScoringPanel(m) : !m.locked ? refereeSetupForm(m) : `<div class="referee-legacy-result"><strong>${m.scoreA} : ${m.scoreB}</strong><p>已結束 · 局數 ${m.gamesA} : ${m.gamesB}</p>${button('請求管理員修正', 'correction', `data-match="${h(m.id)}"`)}</div>`}
 ${m.gameHistory.length ? `<div class="referee-history"><h3>各局紀錄</h3>${m.gameHistory.map((g, i) => `<span>第 ${i + 1} 局 <b>${g.scoreA} : ${g.scoreB}</b></span>`).join('')}</div>` : ''}
 ${refereeManualPanel(m)}</article></div>`;
}
function rememberRefereeSetup(form) {
  refereeSetupDrafts.set(refereeKey(form.dataset.match), readRefereeSetup(form));
}
document.addEventListener('input', (event) => {
  const form = event.target.closest('[data-form=referee-setup]');
  if (!form) return;
  rememberRefereeSetup(form);
  const data = readRefereeSetup(form);
  for (const side of ['A', 'B'])
    [...form.elements['first' + side].options].forEach(
      (option, i) => (option.textContent = data.players[side][i] || side + (i + 1)),
    );
});
document.addEventListener('change', (event) => {
  const form = event.target.closest('[data-form=referee-setup]');
  if (!form) return;
  if (['tossWinner', 'tossChoice'].includes(event.target.name) && form.elements.tossWinner.value) {
    const winner = form.elements.tossWinner.value;
    if (form.elements.tossChoice.value === 'serve') form.elements.servingTeam.value = winner;
    if (form.elements.tossChoice.value === 'receive')
      form.elements.servingTeam.value = winner === 'A' ? 'B' : 'A';
  }
  rememberRefereeSetup(form);
});
document.addEventListener(
  'toggle',
  (event) => {
    const details = event.target;
    if (!details.matches?.('[data-referee-corrections]') || !details.isConnected) return;
    if (details.open) refereeCorrectionOpen.add(details.dataset.refereeCorrections);
    else refereeCorrectionOpen.delete(details.dataset.refereeCorrections);
  },
  true,
);
document.addEventListener('click', (event) => {
  const b = event.target.closest('[data-referee-action]');
  if (!b || b.disabled) return;
  try {
    const mid = b.dataset.match,
      action = b.dataset.refereeAction;
    if (action === 'toggle-list') {
      refereeMatchListExpanded = !refereeMatchListExpanded;
      renderWorkspace();
      return;
    }
    if (action === 'select') {
      if (app.match(mid).refereeId !== app.current()?.id) throw new Error('這不是指派給你的場次。');
      selectedRefereeMatchId = mid;
      sessionStorage.setItem('bluecourt-referee-match-' + app.current().id, mid);
      refereeMatchListExpanded = false;
      renderWorkspace();
      return;
    }
    if (action === 'toss') {
      const form = b.closest('form'),
        values = new Uint8Array(1);
      crypto.getRandomValues(values);
      form.elements.tossWinner.value = values[0] % 2 === 0 ? 'A' : 'B';
      form.elements.tossWinner.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const names = { timeout: 'pause' };
    const data = { winner: b.dataset.winner, team: b.dataset.team };
    app.refereeAction(mid, names[action] || action, data, Number(b.dataset.revision));
  } catch (error) {
    handleError(error);
  }
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!['referee-setup', 'referee-serve'].includes(form.dataset.form)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    if (form.dataset.form === 'referee-setup')
      app.configureReferee(
        form.dataset.match,
        readRefereeSetup(form),
        Number(form.dataset.revision),
      );
    else
      app.refereeAction(
        form.dataset.match,
        'serve',
        Object.fromEntries(new FormData(form)),
        Number(form.dataset.revision),
      );
  } catch (error) {
    handleError(error);
  }
});
function updateRefereeTimeDisplay() {
  document.querySelectorAll('[data-referee-timeout]').forEach((el) => {
    const remaining = Math.max(0, 60 - Math.floor((Date.now() - Number(el.dataset.at)) / 1000));
    el.textContent =
      remaining > 0 ? '暫停剩餘 ' + remaining + ' 秒' : '暫停時間已到，請確認後恢復比賽。';
  });
}
function refreshRefereeStatusList() {
  document.querySelectorAll('[data-referee-match-status]').forEach((el) => {
    const m = app.db.matches.find((m) => m.id === el.dataset.refereeMatchStatus);
    if (m) el.innerHTML = statusBadge(m);
  });
}
window.setInterval(updateRefereeTimeDisplay, 1000);
