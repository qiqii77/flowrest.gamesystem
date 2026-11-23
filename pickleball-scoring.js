/* Traditional side-out doubles scoring. Rules: USA Pickleball 2026, sections 4–6 and 21.
   Court positions use each team's own left/right; rendering mirrors the far court. */
(function (root) {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const other = (side) => (side === 'A' ? 'B' : 'A');
  const fail = (message) => {
    throw new Error(message);
  };
  function validate(config) {
    if (![11, 15, 21].includes(Number(config.target))) fail('請選擇 11、15 或 21 分制。');
    if (![1, 3, 5].includes(Number(config.bestOf))) fail('請選擇一局、三局或五局制。');
    if (!['A', 'B'].includes(config.servingTeam) || !['A', 'B'].includes(config.nearTeam))
      fail('請確認先發球方與場邊。');
    if (![0, 1].includes(Number(config.firstA)) || ![0, 1].includes(Number(config.firstB)))
      fail('請確認雙方先發球員。');
    for (const side of ['A', 'B'])
      for (const name of config.players?.[side] || [])
        if (String(name).length > 100) fail('選手姓名最多 100 字。');
  }
  function positions(first, points) {
    const right = points % 2 === 0 ? first : 1 - first;
    return { left: 1 - right, right };
  }
  function create(m, config) {
    validate(config);
    const firstA = Number(config.firstA),
      firstB = Number(config.firstB);
    const state = {
      version: 1,
      configured: true,
      target: Number(config.target),
      bestOf: Number(config.bestOf),
      players: {
        A: [0, 1].map((i) => String(config.players?.A?.[i] || '').trim()),
        B: [0, 1].map((i) => String(config.players?.B?.[i] || '').trim()),
      },
      firstServers: { A: firstA, B: firstB },
      gameOpeningTeam: config.servingTeam,
      servingTeam: config.servingTeam,
      serverNumber: 2,
      serverPlayer: config.servingTeam === 'A' ? firstA : firstB,
      positions: { A: positions(firstA, m.scoreA), B: positions(firstB, m.scoreB) },
      nearTeam: config.nearTeam,
      gameNearTeam: config.nearTeam,
      endChanged: false,
      tossWinner: config.tossWinner || '',
      tossChoice: config.tossChoice || 'serve',
      timeouts: { A: 0, B: 0 },
      paused: false,
      pause: null,
      gameWinner: '',
      matchWinner: '',
      rallies: 0,
      lastAction: '已確認先發與站位',
      history: [],
    };
    // For a resumed game, the designated server stays in their current score-dependent court.
    m.refereeState = state;
    return state;
  }
  function requireState(m) {
    if (!m.refereeState?.configured) fail('請先確認賽前發球與站位設定。');
    return m.refereeState;
  }
  function saveAction(m, label) {
    const s = requireState(m),
      { history, ...state } = s;
    history.push({
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      gamesA: m.gamesA,
      gamesB: m.gamesB,
      gameHistory: clone(m.gameHistory || []),
      state: clone(state),
    });
    if (history.length > 64) history.shift();
    s.lastAction = label;
  }
  function serverCourt(s) {
    return s.positions[s.servingTeam].right === s.serverPlayer ? 'right' : 'left';
  }
  function receiver(s) {
    const side = other(s.servingTeam);
    return { side, player: s.positions[side][serverCourt(s)] };
  }
  function call(m) {
    const s = requireState(m);
    return [m['score' + s.servingTeam], m['score' + other(s.servingTeam)], s.serverNumber];
  }
  function endThreshold(s) {
    return Math.ceil(s.target / 2);
  }
  function recordWinner(m) {
    const s = requireState(m);
    if (Math.max(m.scoreA, m.scoreB) < s.target || Math.abs(m.scoreA - m.scoreB) < 2) return;
    const winner = m.scoreA > m.scoreB ? 'A' : 'B';
    s.gameWinner = winner;
    m['games' + winner]++;
    m.gameHistory.push({ scoreA: m.scoreA, scoreB: m.scoreB, winner, mode: 'pickleball-sideout' });
    if (m['games' + winner] >= Math.ceil(s.bestOf / 2)) s.matchWinner = winner;
  }
  function rally(m, winner) {
    const s = requireState(m);
    if (!['A', 'B'].includes(winner)) fail('請選擇贏得這一球的隊伍。');
    if (s.paused) fail('請先恢復比賽，再記錄這一球。');
    if (s.gameWinner) fail('本局已結束，請開始下一局或送出結果。');
    saveAction(m, (winner === 'A' ? m.teamA : m.teamB) + ' 贏得這一球');
    if (winner === s.servingTeam) {
      m['score' + winner]++;
      const p = s.positions[winner];
      [p.left, p.right] = [p.right, p.left];
      s.lastAction = (winner === 'A' ? m.teamA : m.teamB) + ' 得分 +1，發球員交換左右位置';
      const gameNumber = (m.gameHistory || []).length + 1;
      if (
        (s.bestOf === 1 || gameNumber === s.bestOf) &&
        !s.endChanged &&
        Math.max(m.scoreA, m.scoreB) >= endThreshold(s)
      ) {
        s.nearTeam = other(s.nearTeam);
        s.endChanged = true;
        s.lastAction += ' · 已達換邊分數，雙方交換場邊';
      }
      recordWinner(m);
    } else if (s.serverNumber === 1) {
      s.serverNumber = 2;
      s.serverPlayer = 1 - s.serverPlayer;
      s.lastAction = '換第二位發球員，比分不變';
    } else {
      s.servingTeam = winner;
      s.serverNumber = 1;
      s.serverPlayer = s.positions[winner].right;
      s.lastAction = '換發球權（Side out），比分不變';
    }
    s.rallies++;
    return s;
  }
  function undo(m) {
    const s = requireState(m),
      previous = s.history.at(-1);
    if (!previous) fail('目前沒有可復原的操作。');
    const remaining = s.history.slice(0, -1);
    Object.assign(m, {
      scoreA: previous.scoreA,
      scoreB: previous.scoreB,
      gamesA: previous.gamesA,
      gamesB: previous.gamesB,
      gameHistory: previous.gameHistory,
    });
    m.refereeState = { ...previous.state, history: remaining, lastAction: '已復原上一個操作' };
    return m.refereeState;
  }
  function swapEnds(m) {
    const s = requireState(m);
    if (s.gameWinner) fail('本局已結束，請先開始下一局。');
    saveAction(m, '手動交換場邊');
    s.nearTeam = other(s.nearTeam);
    return s;
  }
  function timeoutLimit(state) {
    return state.target === 21 ? 3 : 2;
  }
  function pause(m, team = '') {
    const s = requireState(m);
    if (s.paused || s.gameWinner) fail('目前無法暫停。');
    if (team && !['A', 'B'].includes(team)) fail('暫停隊伍無效。');
    if (team && s.timeouts[team] >= timeoutLimit(s))
      fail('該隊本局的' + (timeoutLimit(s) === 2 ? '兩' : '三') + '次暫停已用完。');
    saveAction(m, team ? '隊伍申請暫停' : '裁判暫停比賽');
    if (team) s.timeouts[team]++;
    s.paused = true;
    s.pause = { kind: team ? 'timeout' : 'referee', team, at: Date.now() };
    return s;
  }
  function resume(m) {
    const s = requireState(m);
    if (!s.paused) fail('比賽目前沒有暫停。');
    saveAction(m, '恢復比賽');
    s.paused = false;
    s.pause = null;
    return s;
  }
  function nextGame(m) {
    const s = requireState(m);
    if (!s.gameWinner || s.matchWinner) fail('目前沒有可開始的下一局。');
    saveAction(m, '開始下一局');
    const nextServingTeam = other(s.gameOpeningTeam);
    m.scoreA = 0;
    m.scoreB = 0;
    s.gameOpeningTeam = nextServingTeam;
    s.servingTeam = nextServingTeam;
    s.serverNumber = 2;
    s.serverPlayer = s.firstServers[nextServingTeam];
    s.positions = { A: positions(s.firstServers.A, 0), B: positions(s.firstServers.B, 0) };
    s.nearTeam = other(s.nearTeam);
    s.gameNearTeam = s.nearTeam;
    s.endChanged = false;
    s.timeouts = { A: 0, B: 0 };
    s.gameWinner = '';
    s.matchWinner = '';
    s.paused = false;
    s.pause = null;
    return s;
  }
  function correctServe(m, config) {
    const s = requireState(m);
    if (
      !['A', 'B'].includes(config.team) ||
      ![1, 2].includes(Number(config.number)) ||
      ![0, 1].includes(Number(config.player))
    )
      fail('請確認發球方、發球序及發球員。');
    saveAction(m, '裁判修正發球與站位');
    s.servingTeam = config.team;
    s.serverNumber = Number(config.number);
    s.serverPlayer = Number(config.player);
    if (config.court === 'left' || config.court === 'right') {
      const p = s.positions[config.team];
      p[config.court] = s.serverPlayer;
      p[config.court === 'left' ? 'right' : 'left'] = 1 - s.serverPlayer;
      s.firstServers[config.team] = m['score' + config.team] % 2 === 0 ? p.right : p.left;
    }
    return s;
  }
  function manualCorrection(m) {
    const s = m.refereeState;
    if (!s?.configured) return;
    s.history = [];
    s.gameWinner = '';
    s.matchWinner = '';
    s.paused = false;
    s.pause = null;
    s.positions = {
      A: positions(s.firstServers.A, m.scoreA),
      B: positions(s.firstServers.B, m.scoreB),
    };
    s.lastAction = '已手動修正比分；請核對發球方與站位';
  }
  const api = {
    create,
    call,
    rally,
    undo,
    swapEnds,
    pause,
    resume,
    nextGame,
    correctServe,
    manualCorrection,
    serverCourt,
    receiver,
    endThreshold,
    timeoutLimit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlueCourtPickleball = api;
})(globalThis);
