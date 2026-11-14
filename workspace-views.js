/* Render existing BlueCourt visual components using the shared competition data. */
'use strict';
const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const h = escapeHTML;
const $ = (id) => document.getElementById(id);
const button = (label, action, attrs = '', style = 'secondary-button') =>
  `<button type="button" class="${style}" data-command="${action}" ${attrs}>${h(label)}</button>`;
const options = (values, current) =>
  values
    .map(
      ([value, label]) =>
        `<option value="${h(value)}" ${String(value) === String(current) ? 'selected' : ''}>${h(label)}</option>`,
    )
    .join('');
const field = (label, name, value = '', type = 'text', extra = '') =>
  `<label class="form-field">${h(label)}<input name="${name}" type="${type}" value="${h(value)}" ${extra}></label>`;
const empty = (message) => `<p class="empty-state">${h(message)}</p>`;
const heading = (title, kicker = '') =>
  `<div class="workspace-section-heading"><div><p class="section-kicker">${h(kicker)}</p><h2>${h(title)}</h2></div></div>`;
const statusBadge = (m) =>
  `<span class="match-state state-${h(m.status)}">${h(BlueCourt.statuses[m.status])}${m.locked ? ' · 已鎖定' : ''}</span>`;
function matchCard(m, extra = '') {
  const e = app.db.events.find((e) => e.id === m.eventId);
  return `<article class="competition-card" data-match-id="${h(m.id)}">
    <div class="competition-card-head"><div><p class="section-kicker">${h(e.name)} · ${h(m.group)}${m.roundLabel ? ' · ' + h(m.roundLabel) : ''}</p><strong>${h(m.date)} ${h(m.time)} · ${h(m.venue)} · ${h(m.court)}</strong></div>${statusBadge(m)}</div>
    <div class="public-score"><span>${h(m.teamA)}</span><div><small>局數（大比分）</small><strong class="public-games">${m.gamesA} : ${m.gamesB}</strong><small>本局得分（小比分）</small><strong>${m.scoreA} : ${m.scoreB}</strong></div><span>${h(m.teamB)}</span></div>
    ${extra}</article>`;
}
function livePreview(event) {
  const url = BlueCourtDemo.streamUrl(event.streamUrl);
  const demo = url === 'https://www.youtube.com/';
  const content = `<span class="stream-live-badge"><span class="stream-live-dot" aria-hidden="true"></span>LIVE</span>
    <span class="stream-court-art" aria-hidden="true"></span>
    <span class="stream-play" aria-hidden="true">▶</span>
    <span class="stream-caption"><strong>${h(event.name)}</strong><span>${url ? (demo ? '示範直播入口 · 前往 YouTube' : '點擊前往外部直播網站') : '直播連結尚未設定'}<span aria-hidden="true"> ↗</span></span></span>`;
  return url
    ? `<a class="live-preview" href="${h(url)}" target="_blank" rel="noopener noreferrer" data-live-event="${h(event.id)}" aria-label="${h(event.name)}，${demo ? '前往 YouTube 示範入口' : '開啟外部直播網站'}（另開分頁）">${content}</a>`
    : `<div class="live-preview stream-unavailable" role="img" aria-label="直播連結尚未設定">${content}</div>`;
}
function eventPicker(events, command = 'event-select') {
  return `<label class="compact-select">目前賽事<select id="${command}" aria-label="目前賽事">${options(
    events.map((e) => [e.id, e.name]),
    activeEvent,
  )}</select></label>`;
}
function eventSummary(e) {
  const entries = app.db.entries.filter((r) => r.eventId === e.id);
  const matches = app.db.matches.filter((m) => m.eventId === e.id);
  return `${heading(e.name, e.sport + ' · ' + e.location)}
    <div class="summary-strip"><div><span>報名隊伍</span><strong>${entries.length} / ${e.capacity}</strong></div>
    <div><span>待審核</span><strong>${entries.filter((r) => r.status === 'pending').length}</strong></div>
    <div><span>進行中</span><strong>${matches.filter((m) => m.status === 'started').length}</strong></div>
    <div><span>已結束</span><strong>${matches.filter((m) => m.locked).length}</strong></div></div>
    <p class="muted-copy">${h(e.date)} · ${e.courts} 個場地 · 報名${e.registrationOpen ? '開放中' : '已關閉'} · 截止日 ${h(e.deadline)}</p>
    <details class="stream-settings"><summary>直播連結設定</summary><form class="workflow-form" data-form="stream" data-event="${h(e.id)}">
      ${field('外部直播網址', 'streamUrl', e.streamUrl || '', 'url', 'placeholder="https://www.youtube.com/watch?v=..."')}
      <p class="muted-copy">首頁直播預覽框會在新分頁開啟這個網址。留空可暫時移除連結。</p><button class="primary-button">儲存直播網址</button>
    </form></details>
    ${e.registrationOpen ? button('關閉報名並自動產生首輪賽程', 'close-registration', `data-event="${h(e.id)}"`) : ''}
    ${tournamentSummary(e)}
    ${
      matches
        .filter((m) => !activeGroup || m.group === activeGroup)
        .map((m) => matchCard(m))
        .join('') || empty('尚未產生賽程。關閉報名後會依已核准隊伍配對。')
    }
    ${!e.registrationOpen && entries.some((r) => r.status === 'pending') ? '<p class="notice">仍有未核准報名，未納入自動配對。</p>' : ''}`;
}
function tournamentSummary(e) {
  const entries = app.db.entries.filter((r) => r.eventId === e.id);
  const matches = app.db.matches.filter((m) => m.eventId === e.id);
  if (!e.groups.includes(activeGroup)) activeGroup = '';
  return `<div class="category-summary">${e.groups
    .map((group) => {
      const groupMatches = matches.filter((m) => m.group === group);
      const final = groupMatches.find((m) => m.roundLabel === '決賽' && m.locked);
      return (
        '<article><h3>' +
        h(group) +
        '</h3><strong>' +
        entries.filter((r) => r.group === group).length +
        ' 組</strong><p>' +
        groupMatches.length +
        ' 場 · 已結束 ' +
        groupMatches.filter((m) => m.locked).length +
        ' 場</p><p>' +
        (final ? '冠軍：' + h(final['team' + final.winnerSide]) : '冠軍待定') +
        '</p></article>'
      );
    })
    .join(
      '',
    )}</div><div class="workspace-subnav" aria-label="篩選競賽項目">${button('全部項目', 'group-filter', `data-group="" aria-pressed="${!activeGroup}"`)}${e.groups.map((group) => button(group, 'group-filter', `data-group="${h(group)}" aria-pressed="${activeGroup === group}"`)).join('')}</div>`;
}
function registrationList(e) {
  const entries = app.db.entries.filter((r) => r.eventId === e.id);
  return (
    heading('報名審核', e.name) +
    (entries
      .map((r) => {
        const user = app.db.users.find((u) => u.id === r.userId);
        return `<article class="competition-card review-summary-card">
      <button type="button" class="review-card-open" data-command="open-registration" data-entry="${h(r.id)}" aria-haspopup="dialog" aria-label="開啟 ${h(r.team)} 的完整報名資料">
        <span><strong>${h(r.team)}</strong><span>${h(r.group)} · ${h(r.contact?.name || user?.name)} · ${h(user?.email)}</span></span>
        <span class="review-card-status">${h({ pending: '待審核', approved: '已核准', rejected: '未通過' }[r.status])}<small>查看完整資料 →</small></span>
      </button>
      ${!e.scheduled ? `<div class="inline-actions review-card-actions">${button('核准', 'review', `data-entry="${h(r.id)}" data-status="approved"`)}${button('不通過', 'review', `data-entry="${h(r.id)}" data-status="rejected"`)}</div>` : '<p class="muted-copy review-card-actions">賽程已產生，請至賽事更動處理。</p>'}</article>`;
      })
      .join('') || empty('目前沒有報名資料。'))
  );
}
function registrationDetailBody(data) {
  const { entry: r, event: e, user } = data,
    contact = r.contact || user;
  const value = (v) =>
    typeof v === 'boolean'
      ? v
        ? '已勾選'
        : '未勾選'
      : v === null || v === undefined || v === ''
        ? '未填寫'
        : String(v);
  const rows = r.answers?.length
    ? r.answers
    : [
        ['name', '姓名'],
        ['phone', '聯絡電話'],
        ['birthday', '出生日期'],
        ['gender', '性別'],
        ['address', '聯絡地址'],
        ['emergencyName', '緊急聯絡人'],
        ['emergencyPhone', '緊急聯絡電話'],
      ].map(([id, label]) => ({ label, value: contact[id] }));
  const payment = r.payment;
  return `<section class="registration-detail">
    <div class="review-detail-meta"><span>${h(r.group)}</span><strong>${h({ pending: '待審核', approved: '已核准', rejected: '未通過' }[r.status])}</strong></div>
    <p>選手／隊伍：${h(r.team)}</p><p>登入電子郵件：${h(user.email || '未提供')}</p>
    ${r.submittedAt ? '<p>報名時間：' + h(new Date(r.submittedAt).toLocaleString('zh-TW')) + '</p>' : ''}
    <h3>完整報名資料</h3><dl class="registration-detail-answers">${rows.map((a) => `<div><dt>${h(a.label)}</dt><dd>${h(value(a.value))}</dd></div>`).join('')}</dl>
    <h3>繳費資訊</h3><p>${payment?.mode === 'planned' ? '報名費 NT$ ' + payment.amount + ' · 預留方式：' + h(BlueCourtForms.paymentMethods[payment.method] || '尚未選擇') + ' · 尚未開放付款' : '免費報名'}</p>
    ${payment?.note ? '<p>' + h(payment.note) + '</p>' : ''}
    ${externalSystemLink(r.formSnapshot?.external)}
    <p class="muted-copy">${r.formSnapshot ? '報名表版本：' + r.formSnapshot.revision : '此筆為示範／舊版報名資料。'}</p>
    ${!e.scheduled ? `<div class="inline-actions">${button('核准', 'review', `data-entry="${h(r.id)}" data-status="approved"`, 'primary-button')}${button('不通過', 'review', `data-entry="${h(r.id)}" data-status="rejected"`)}</div>` : '<p class="notice">賽程已產生，請透過賽事更動處理異動。</p>'}
  </section>`;
}
function openRegistrationDetails(entryId) {
  const data = app.registrationDetails(entryId);
  modal({
    title: '報名資料 · ' + data.entry.team,
    description: data.event.name,
    body: registrationDetailBody(data),
  });
  $('actionModal').dataset.reviewEntry = entryId;
  modalReturnFocus =
    document.querySelector(
      '[data-command="open-registration"][data-entry="' + CSS.escape(entryId) + '"]',
    ) || modalReturnFocus;
}
function personnel(e) {
  const matches = app.db.matches.filter((m) => m.eventId === e.id);
  const users = app.db.users.filter(
    (u) => u.canLogin !== false && !u.admin && !e.managers.includes(u.id),
  );
  return (
    heading('人員管理', e.name) +
    `<p class="muted-copy">以已註冊帳號指派每場裁判；解除全部指派後，帳號會恢復一般選手介面。</p>
    <div class="competition-card"><strong>賽事管理員</strong><p>${h(e.managers.map((uid) => app.db.users.find((u) => u.id === uid)?.email).join('、') || '尚未指派')}</p></div>
    ${
      matches
        .map(
          (
            m,
          ) => `<form class="workflow-form personnel-form" data-form="referee" data-match="${h(m.id)}">
      <strong>${h(m.teamA)} vs ${h(m.teamB)} · ${h(m.date)} ${h(m.time)} · ${h(m.venue)} · ${h(m.court)}</strong>
      <label class="form-field">指派裁判帳號<select name="email" ${m.locked ? 'disabled' : ''}>${options([['', '不指派'], ...users.map((u) => [u.email, u.name + ' · ' + u.email])], app.db.users.find((u) => u.id === m.refereeId)?.email || '')}</select></label>
      <button class="primary-button" ${m.locked ? 'disabled' : ''}>儲存指派</button></form>`,
        )
        .join('') || empty('賽程產生後即可指派裁判。')
    }
    <div class="workspace-subheading"><h3>比分修正請求與處理紀錄</h3></div>${auditList(e.id, true)}`
  );
}
function auditList(eid = '', correctionsOnly = false) {
  const mids = app.db.matches.filter((m) => m.eventId === eid).map((m) => m.id);
  const rows = app.db.audit.filter(
    (a) =>
      (!eid || a.target === eid || mids.includes(a.target)) &&
      (!correctionsOnly || a.action.includes('比分')),
  );
  return (
    rows
      .slice(0, 60)
      .map(
        (a) =>
          `<div class="audit-row"><time>${h(new Date(a.at).toLocaleString('zh-TW'))}</time><strong>${h(a.action)}</strong><span>${h(app.db.users.find((u) => u.id === a.userId)?.name)} · ${h(a.detail)}</span></div>`,
      )
      .join('') || empty('目前沒有紀錄。')
  );
}
function matchChanges(e) {
  return (
    heading('賽事更動', e.name) +
    `<p class="muted-copy">裁判更新的狀態會同步顯示。可調整日期、時間與場地，或將同日同場地後續尚未開始的場次一起延後。</p>` +
    (app.db.matches
      .filter((m) => m.eventId === e.id)
      .map((m) =>
        matchCard(
          m,
          m.locked
            ? `<p class="notice">最終比分已鎖定。${!m.entryB ? '此場為輪空。' : ''}</p>${m.entryB ? button('填寫原因並重新開放比分', 'unlock', `data-match="${h(m.id)}"`) : ''}`
            : `<form class="workflow-form match-edit-form" data-form="match" data-match="${h(m.id)}">
        <input name="revision" type="hidden" value="${m.revision}"><div class="form-grid">${field('比賽日期', 'date', m.date, 'date', 'required')}${field('時間', 'time', m.time, 'time', 'required')}
        ${field('場館', 'venue', m.venue, 'text', 'required maxlength="100" placeholder="例如：主場館、體育中心 2F"')}
        ${field('場地名稱', 'court', m.court, 'text', 'required maxlength="100" placeholder="例如：中央球場、A1、東側場地"')}
        <label class="form-field">賽況<select name="status">${options(
          Object.entries(BlueCourt.statuses).filter(([k]) => k !== 'finished'),
          m.status,
        )}</select></label></div>
        ${field('同日同場地後續場次延後（分鐘）', 'delay', 0, 'number', 'min="0" max="1440" required')}
        <button class="primary-button">儲存賽事更動</button></form>`,
        ),
      )
      .join('') || empty('報名關閉後自動產生首輪賽程。'))
  );
}
function scoreColumn(m, side, measure, disabled) {
  const key = (measure === 'games' ? 'games' : 'score') + side;
  const label = m['team' + side] + (measure === 'games' ? ' 局數' : ' 本局得分');
  return `<div class="flip-counter ${measure === 'games' ? 'small-counter' : 'point-counter'}">
    ${button('▲', 'score', `data-match="${h(m.id)}" data-side="${side}" data-delta="1" data-measure="${measure}" aria-label="${h(label)}加一" ${disabled}`, 'score-arrow')}
    <output aria-live="polite" aria-label="${h(label)}">${m[key]}</output>
    ${button('▼', 'score', `data-match="${h(m.id)}" data-side="${side}" data-delta="-1" data-measure="${measure}" aria-label="${h(label)}減一" ${disabled}`, 'score-arrow')}
  </div>`;
}
function refereeBoard() {
  const matches = app.db.matches.filter((m) => m.refereeId === app.current().id);
  return (
    heading('管理報到與分數', '僅顯示指派給你的場次') +
    (matches
      .map((m) => {
        const disabled = m.locked || m.status !== 'started' ? 'disabled' : '';
        return matchCard(
          m,
          `<div class="referee-tools">
      <fieldset class="checkin-group" ${m.locked || ['started', 'cancelled'].includes(m.status) ? 'disabled' : ''}><legend>本場報到</legend>
      <label><input type="checkbox" data-checkin="${h(m.id)}" data-side="A" ${m.checkedA ? 'checked' : ''}>${h(m.teamA)} 已報到</label>
      <label><input type="checkbox" data-checkin="${h(m.id)}" data-side="B" ${m.checkedB ? 'checked' : ''}>${h(m.teamB)} 已報到</label></fieldset>
      <div class="inline-actions" role="group" aria-label="更新賽事狀況">${['delayed', 'cancelled', 'started'].map((status) => button(BlueCourt.statuses[status], 'status', `data-match="${h(m.id)}" data-status="${status}" aria-pressed="${m.status === status}" ${m.locked ? 'disabled' : ''}`)).join('')}</div>
      <div class="flip-scoreboard" aria-label="本場記分板">
        <div class="scoreboard-caption">本局得分（小比分）</div>
        <div class="flip-scoreboard-main">
          ${scoreColumn(m, 'A', 'points', disabled)}
          <div class="games-counters"><span>局數（大比分）</span><div class="games-pair">${scoreColumn(m, 'A', 'games', disabled)}${scoreColumn(m, 'B', 'games', disabled)}</div></div>
          ${scoreColumn(m, 'B', 'points', disabled)}
        </div>
        <div class="scoreboard-teams"><strong>${h(m.teamA)}</strong><strong>${h(m.teamB)}</strong></div>
      </div>
      ${m.gameHistory.length ? '<div class="game-history"><strong>各局比分</strong>' + m.gameHistory.map((g, i) => '<span>第 ' + (i + 1) + ' 局 ' + g.scoreA + ' : ' + g.scoreB + '</span>').join('') + '</div>' : ''}
      <div class="inline-actions">${button('本局得分歸零', 'reset', `data-match="${h(m.id)}" ${disabled}`)}
      ${button('全部比分歸零', 'reset-all', `data-match="${h(m.id)}" ${disabled}`)}
      ${button('記錄本局並開始下一局', 'finish-game', `data-match="${h(m.id)}" ${disabled}`)}
      ${button('結束並送出比分', 'finalize', `data-match="${h(m.id)}" ${disabled}`, 'primary-button')}
      ${m.locked ? button('請求管理員修正', 'correction', `data-match="${h(m.id)}"`) : ''}</div>
      <p class="muted-copy">${m.locked ? '比分已鎖定。如需變更，請請求賽事管理員重新開放。' : m.status === 'started' ? '使用上下箭頭計分，賽況同步更新。' : '完成雙方報到並將賽況設為「開始」後，即可操作記分板。'}</p></div>`,
        );
      })
      .join('') || empty('目前尚未獲指派任何場次。'))
  );
}
function playerEntries() {
  const entries = app.db.entries.filter((r) => r.userId === app.current().id);
  return (
    heading('我的報名賽事') +
    (entries
      .map((r) => {
        const e = app.event(r.eventId);
        return `<article class="competition-card"><div class="competition-card-head"><div><strong>${h(e.name)}</strong><p>${h(r.group)} · ${h(r.team)}</p></div><span>${h({ pending: '報名成功 · 待審核', approved: '報名已核准', rejected: '審核未通過' }[r.status])}</span></div><p>${h(e.date)} · ${h(e.location)}</p>${submittedAnswers(r)}</article>`;
      })
      .join('') || empty('尚未報名賽事。請到系統首頁選擇開放報名的比賽。')) +
    button('前往首頁尋找比賽', 'home-events')
  );
}
function playerSchedule() {
  const entries = app.db.entries.filter((r) => r.userId === app.current().id).map((r) => r.id);
  const matches = app.db.matches.filter(
    (m) => entries.includes(m.entryA) || entries.includes(m.entryB),
  );
  return (
    heading('我的賽程') +
    (matches.map((m) => matchCard(m)).join('') ||
      empty('目前沒有已安排的場次；報名關閉並完成排程後會顯示。'))
  );
}
function playerCenter() {
  const u = app.current(),
    entries = app.db.entries.filter((r) => r.userId === u.id);
  return `<div class="profile-identity"><div class="avatar">${h(u.name.slice(0, 2))}</div><div><strong>${h(u.name)}</strong><p>${h(u.email)}</p></div></div>
    <div class="summary-strip"><div><span>已報名賽事</span><strong>${entries.length}</strong></div><div><span>已核准</span><strong>${entries.filter((r) => r.status === 'approved').length}</strong></div><div><span>待審核</span><strong>${entries.filter((r) => r.status === 'pending').length}</strong></div><div><span>球員等級</span><strong>${h(u.level || '未填寫')}</strong></div></div>${playerEntries()}`;
}
function profileView() {
  const u = app.current();
  if (editingProfile)
    return (
      heading('編輯個人資料') +
      `<form class="workflow-form" data-form="profile">
    <div class="form-grid">${field('姓名', 'name', u.name, 'text', 'required autocomplete="name"')}${field('聯絡電話', 'phone', u.phone, 'tel', 'required autocomplete="tel"')}
    ${field('出生日期', 'birthday', u.birthday, 'date', 'required')}<label class="form-field">性別<select name="gender">${options(
      ['不透露', '男', '女', '其他'].map((v) => [v, v]),
      u.gender,
    )}</select></label>
    ${field('緊急聯絡人', 'emergencyName', u.emergencyName, 'text', 'required')}${field('緊急聯絡電話', 'emergencyPhone', u.emergencyPhone, 'tel', 'required')}
    ${field('聯絡地址', 'address', u.address, 'text', 'autocomplete="street-address"')}${field('球員等級／積分', 'level', u.level)}</div>
    <div class="inline-actions"><button class="primary-button">儲存資料</button>${button('取消', 'cancel-profile')}</div></form>`
    );
  const rows = [
    ['姓名', u.name],
    ['電子郵件', u.email],
    ['帳號權限', BlueCourt.labels[app.role()]],
    ['聯絡電話', u.phone],
    ['出生日期', u.birthday],
    ['性別', u.gender],
    ['聯絡地址', u.address],
    ['緊急聯絡人', u.emergencyName],
    ['緊急聯絡電話', u.emergencyPhone],
    ['球員等級／積分', u.level],
  ];
  return `<div class="workspace-section-heading"><div><p class="section-kicker">報名聯絡資料</p><h2>個人資料</h2></div>${button('編輯資料', 'edit-profile')}</div>
    <div class="profile-details">${rows.map(([k, v]) => `<div><span>${h(k)}</span><strong>${h(v || '尚未填寫')}</strong></div>`).join('')}</div>`;
}
function adminEventForm() {
  return (
    heading('賽事登錄', '建立新的公開賽事') +
    `<form class="workflow-form" data-form="event">
    ${field('賽事名稱', 'name', '', 'text', 'required')}${field('運動項目', 'sport', '', 'text', 'required')}${field('地點', 'location', '', 'text', 'required')}
    <div class="form-grid">${field('比賽日期', 'date', '', 'date', 'required')}${field('首場時間', 'time', '09:00', 'time', 'required')}
    ${field('報名截止日', 'deadline', '', 'date', 'required')}${field('場地數', 'courts', 4, 'number', 'min="1" max="100" required')}
    ${field('報名上限', 'capacity', 32, 'number', 'min="2" max="256" required')}${field('每場間隔（分鐘）', 'interval', 40, 'number', 'min="1" max="240" required')}</div>
    <label class="form-field">場館與場地清單（每行一個，場館｜場地名稱）<textarea name="locations" rows="4" placeholder="主場館｜中央球場&#10;主場館｜A1&#10;副場館｜東側球場"></textarea></label>
    ${field('外部直播網址（選填）', 'streamUrl', '', 'url', 'placeholder="https://www.youtube.com/watch?v=..."')}
    ${field('競賽組別（以頓號分隔）', 'groups', '男子單打、女子單打', 'text', 'required')}
    <button class="primary-button">建立賽事</button></form>`
  );
}
function adminUsers() {
  return (
    heading('使用者管理', '系統權限與賽事指派') +
    app.db.users
      .filter((u) => u.canLogin !== false)
      .map(
        (u) => `<article class="competition-card">
    <div class="competition-card-head"><div><strong>${h(u.name)}</strong><p>${h(u.email)} · ${h(BlueCourt.labels[app.role(u)])}</p></div>
    ${button(u.admin ? '移除系統管理權限' : '設為系統管理員', 'admin-role', `data-user="${h(u.id)}" ${u.id === app.current().id ? 'disabled' : ''}`)}</div>
    <p class="muted-copy">負責賽事：${h(
      app.db.events
        .filter((e) => e.managers.includes(u.id))
        .map((e) => e.name)
        .join('、') || '無',
    )} · 裁判場次：${app.db.matches.filter((m) => m.refereeId === u.id).length}</p></article>`,
      )
      .join('')
  );
}
function adminAssignments() {
  const e = app.event(activeEvent);
  return (
    heading('管理員指派', e.name) +
    `<form class="workflow-form" data-form="manager" data-event="${h(e.id)}">
    <label class="form-field">已註冊帳號<select name="email" required>${options(
      app.db.users
        .filter((u) => u.canLogin !== false && !u.admin)
        .map((u) => [u.email, u.name + ' · ' + u.email]),
      '',
    )}</select></label>
    <label class="form-field">操作<select name="operation"><option value="add">指派賽事管理員</option><option value="remove">移除賽事管理員</option></select></label>
    <button class="primary-button">儲存權限</button></form>${personnel(e)}`
  );
}

function enrollmentView(e, u) {
  const config = BlueCourtForms.getConfig(e);
  return `${heading('報名 ' + e.name, e.date + ' · ' + e.location)}
    <p class="muted-copy">填寫本次報名資料。標示 * 為必填，聯絡資料會同步至個人資料。</p>
    <form class="workflow-form enrollment-form" data-form="enrollment" data-event="${h(e.id)}">
      <input name="formRevision" type="hidden" value="${config.revision}">
      ${enrollmentFields(e, u, config)}
      <div class="inline-actions"><button class="primary-button" type="submit">確認送出報名</button>${button('返回賽事列表', 'cancel-enrollment')}</div>
    </form>`;
}
