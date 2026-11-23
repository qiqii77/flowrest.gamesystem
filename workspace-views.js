/* Render existing BlueCourt visual components using the shared competition data. */
'use strict';
const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const h = escapeHTML;
const $ = (id) => document.getElementById(id);
const button = (label, action, attrs = '', style = 'secondary-button', iconName = '') =>
  `<button type="button" class="${style}" data-command="${action}" ${attrs}>${iconName ? icon(iconName) : ''}${h(label)}</button>`;
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
  `<span data-match-state class="match-state state-${h(m.status)}">${h(m.autoDelayed ? '延遲 · 尚未開始' : BlueCourt.statuses[m.status])}${m.locked ? ' · 已鎖定' : ''}</span>`;
function workspaceSearchKey(kind, eventId) {
  return [app.current()?.id || 'guest', kind, eventId].join(':');
}
function workspaceSearchPanel(kind, e, placeholder, content) {
  const query = workspaceSearchQueries.get(workspaceSearchKey(kind, e.id)) || '';
  return `<section class="workspace-search-scope" data-search-scope="${kind}" data-search-event="${h(e.id)}">
    <div class="workspace-search-bar"><label class="workspace-search-label" for="search-${kind}">搜尋${{ changes: '賽事更動', review: '報名資料', roster: '選手名單', schedule: '全部賽程' }[kind]}</label>
      <div class="workspace-search-controls"><input class="workspace-search-input" id="search-${kind}" type="search" value="${h(query)}" maxlength="200" placeholder="${h(placeholder)}" autocomplete="off" data-workspace-search>
      ${button('清除搜尋', 'clear-workspace-search', query ? '' : 'disabled')}</div>
      <p class="workspace-search-count" data-search-count role="status" aria-live="polite"></p>
      <p class="muted-copy">可輸入多個關鍵字，以空格分隔；依目前頁面的賽事範圍搜尋。</p>
    </div>
    <p class="empty-state" data-search-empty hidden>找不到符合條件的資訊，請更換關鍵字或清除搜尋。</p>
    <div class="workspace-search-results">${content}</div></section>`;
}
function searchableItem(id, keywords, content) {
  return `<div class="workspace-search-item" data-search-item="${h(id)}" data-search-text="${h(keywords.filter((v) => v !== undefined && v !== null).join(' '))}">${content}</div>`;
}
function matchSearchTerms(m) {
  const referee = app.db.users.find((u) => u.id === m.refereeId);
  return [
    m.teamA,
    m.teamB,
    m.group,
    m.roundLabel,
    m.date,
    m.time,
    m.venue,
    m.court,
    BlueCourt.statuses[m.status],
    m.locked ? '已鎖定' : '未鎖定',
    referee?.name,
    referee?.email,
    referee?.phone,
    referee ? '裁判' : '尚未指派裁判',
  ];
}
function applyWorkspaceSearch(scope) {
  if (!scope) return;
  const input = scope.querySelector('[data-workspace-search]');
  if (!input) return;
  workspaceSearchQueries.set(
    workspaceSearchKey(scope.dataset.searchScope, scope.dataset.searchEvent),
    input.value,
  );
  const normalize = (value) => String(value).normalize('NFKC').toLocaleLowerCase('zh-TW');
  const tokens = normalize(input.value).trim().split(/\s+/).filter(Boolean);
  const items = [...scope.querySelectorAll('[data-search-item]')];
  let matched = 0;
  for (const item of items) {
    const text = normalize(item.dataset.searchText);
    item.hidden = !tokens.every((token) => text.includes(token));
    if (!item.hidden) matched++;
  }
  scope.querySelector('[data-search-count]').textContent = tokens.length
    ? '找到 ' + matched + ' / ' + items.length + ' 筆符合資料'
    : '共 ' + items.length + ' 筆資料';
  scope.querySelector('[data-search-empty]').hidden =
    !tokens.length || matched > 0 || !items.length;
  scope.querySelector('[data-command=clear-workspace-search]').disabled = !input.value.length;
}
function matchCard(m, extra = '') {
  const e = app.db.events.find((e) => e.id === m.eventId);
  return `<article class="competition-card ${m.status === 'finished' ? 'match-finished' : ''}" data-match-id="${h(m.id)}">
    <div class="competition-card-head"><div><p class="section-kicker">${h(e.name)} · ${h(m.group)}${m.roundLabel ? ' · ' + h(m.roundLabel) : ''}</p><strong>${h(m.date)} ${h(m.time)} · ${h(m.venue)} · ${h(m.court)}</strong></div>${statusBadge(m)}</div>
    <div class="public-score"><span>${h(m.teamA)}</span><div><small>局數（大比分）</small><strong class="public-games">${m.gamesA} : ${m.gamesB}</strong><small>本局得分（小比分）</small><strong>${m.scoreA} : ${m.scoreB}</strong></div><span>${h(m.teamB)}</span></div>
    ${extra}</article>`;
}
function livePreview(event) {
  const url = BlueCourtDemo.streamUrl(event.streamUrl);
  const demo = url === 'https://www.youtube.com/';
  const content = `<span class="stream-live-badge"><span class="stream-live-dot app-icon icon-circle" aria-hidden="true"></span>LIVE</span>
    <span class="stream-court-art" aria-hidden="true"></span>
    <span class="stream-play" aria-hidden="true">${icon('play')}</span>
    <span class="stream-caption"><strong>${h(event.name)}</strong><span>${url ? (demo ? '示範直播入口 · 前往 YouTube' : '點擊前往外部直播網站') : '直播連結尚未設定'}${icon('external-link')}</span></span>`;
  return url
    ? `<a class="live-preview" href="${h(url)}" target="_blank" rel="noopener noreferrer" data-live-event="${h(event.id)}" aria-label="${h(event.name)}，${demo ? '前往 YouTube 示範入口' : '開啟外部直播網站'}（另開分頁）">${content}</a>`
    : `<div class="live-preview stream-unavailable" role="img" aria-label="直播連結尚未設定">${content}</div>`;
}
function eventPicker(events, command = 'event-select') {
  const lookup = app.role() === 'admin';
  return `<div class="event-lookup">${lookup ? field('搜尋賽事', 'eventLookup', eventLookupQuery, 'search', 'data-event-lookup placeholder="名稱、日期、運動或地點"') : ''}
    <label class="compact-select">目前賽事<select id="${command}" aria-label="目前賽事">${options(
      events.map((e) => [e.id, e.name]),
      activeEvent,
    )}</select></label>
    ${lookup ? '<p data-event-lookup-count role="status">可搜尋後選取對應賽事。</p>' : ''}</div>`;
}
function eventSummary(e) {
  const entries = app.db.entries.filter((r) => r.eventId === e.id);
  const matches = app.db.matches.filter((m) => m.eventId === e.id);
  return `${heading(e.name, e.sport + ' · ' + e.location)}
    <div class="summary-strip"><div><span>報名隊伍</span><strong>${entries.length} / ${e.capacity}</strong></div>
    <div><span>審核中項目</span><strong>${entries.filter((r) => r.status === 'pending').length}</strong></div>
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
  const content =
    entries
      .map((r) => {
        const user = app.db.users.find((u) => u.id === r.userId);
        const status = { pending: '待審核', approved: '已核准', rejected: '未通過' }[r.status];
        const keywords = [
          r.id,
          r.team,
          r.group,
          status,
          user?.name,
          user?.email,
          user?.phone,
          ...Object.values(r.contact || {}),
          ...(r.answers || []).flatMap((a) => [a.label, a.value]),
          r.payment?.amount,
          BlueCourtForms.paymentMethods[r.payment?.method],
        ];
        return searchableItem(
          r.id,
          keywords,
          `<article class="competition-card review-summary-card">
      <button type="button" class="review-card-open" data-command="open-registration" data-entry="${h(r.id)}" aria-haspopup="dialog" aria-label="開啟 ${h(r.team)} 的完整報名資料">
        <span><strong>${h(r.team)}</strong><span>${h(r.group)} · ${h(r.contact?.name || user?.name)} · ${h(user?.email)}</span></span>
        <span class="review-card-status">${h(status)}<small>查看完整資料 ${icon('arrow-right')}</small></span>
      </button>
      ${!e.scheduled && app.role() !== 'admin' ? `<div class="inline-actions review-card-actions">${button('核准', 'review', `data-entry="${h(r.id)}" data-status="approved"`)}${button('不通過', 'review', `data-entry="${h(r.id)}" data-status="rejected"`)}</div>` : '<p class="muted-copy review-card-actions">報名審核由賽事管理員處理；排程後請至賽事更動處理。</p>'}</article>`,
        );
      })
      .join('') || empty('目前沒有報名資料。');
  return (
    heading('報名審核', e.name) +
    workspaceSearchPanel(
      'review',
      e,
      '搜尋姓名、隊伍、Email、電話、項目、審核狀態或表單答案',
      content,
    )
  );
}
function registrationDetailBody(data, readOnly = false) {
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
    ${readOnly ? '' : !e.scheduled && app.role() !== 'admin' ? `<div class="inline-actions">${button('核准', 'review', `data-entry="${h(r.id)}" data-status="approved"`, 'primary-button')}${button('不通過', 'review', `data-entry="${h(r.id)}" data-status="rejected"`)}</div>` : '<p class="notice">報名審核由賽事管理員處理；排程後請至賽事更動處理異動。</p>'}
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
function auditList(eid = '', correctionsOnly = false, searchable = false) {
  const mids = app.db.matches.filter((m) => m.eventId === eid).map((m) => m.id);
  const rows = app.db.audit.filter(
    (a) =>
      (!eid || a.target === eid || mids.includes(a.target)) &&
      (!correctionsOnly || a.action.includes('比分')),
  );
  return (
    rows
      .slice(0, 60)
      .map((a) => {
        const actor = app.db.users.find((u) => u.id === a.userId),
          match = app.db.matches.find((m) => m.id === a.target);
        const content = `<div class="audit-row"><time>${h(new Date(a.at).toLocaleString('zh-TW'))}</time><strong>${h(a.action)}</strong><span>${h(actor?.name)} · ${h(a.detail)}</span></div>`;
        return searchable
          ? searchableItem(
              a.id,
              [
                a.action,
                a.detail,
                actor?.name,
                actor?.email,
                ...(match ? matchSearchTerms(match) : []),
              ],
              content,
            )
          : content;
      })
      .join('') || empty('目前沒有紀錄。')
  );
}
function refereeAssignmentForm(m) {
  const e = app.event(m.eventId);
  const users = app.db.users.filter(
    (u) => u.canLogin !== false && !u.admin && !e.managers.includes(u.id),
  );
  const prefill =
    staffRefereePrefill?.owner === app.current()?.id && staffRefereePrefill?.eventId === e.id
      ? staffRefereePrefill.email
      : '';
  const email = app.db.users.find((u) => u.id === m.refereeId)?.email || prefill;
  return `<details class="match-referee-assignment" data-referee-assignment="${h(m.id)}">
    <summary>裁判指派 · ${m.refereeId ? '已指派' : '尚未指派'}</summary>
    <form class="workflow-form" data-form="referee" data-match="${h(m.id)}">
    ${registeredAccountSearch(users, email, m.locked)}
    <button class="primary-button" ${m.locked ? 'disabled' : ''}>儲存指派</button></form></details>`;
}

function matchChanges(e) {
  const content =
    app.db.matches
      .filter((m) => m.eventId === e.id)
      .map((m) =>
        searchableItem(
          m.id,
          matchSearchTerms(m),
          matchCard(
            m,
            (m.locked
              ? `<p class="notice">最終比分已鎖定。${!m.entryB ? '此場為輪空。' : ''}</p>${m.entryB ? button('填寫原因並重新開放比分', 'unlock', `data-match="${h(m.id)}"`) : ''}`
              : `<form class="workflow-form match-edit-form" data-form="match" data-match="${h(m.id)}">
      <input name="revision" type="hidden" value="${m.revision}"><div class="form-grid">${field('比賽日期', 'date', m.date, 'date', 'required')}${field('時間', 'time', m.time, 'time', 'required')}
      ${field('場館', 'venue', m.venue, 'text', 'required maxlength="100" placeholder="例如：主場館、體育中心 2F"')}
      ${field('場地名稱', 'court', m.court, 'text', 'required maxlength="100" placeholder="例如：中央球場、A1、東側場地"')}
      <label class="form-field">賽況<select name="status">${options(
        Object.entries(BlueCourt.statuses).filter(([key]) => key !== 'finished'),
        m.status,
      )}</select></label></div>
      ${field('同日同場地後續場次延後（分鐘）', 'delay', 0, 'number', 'min="0" max="1440" required')}<button class="primary-button">儲存賽事更動</button></form>`) +
              refereeAssignmentForm(m),
          ),
        ),
      )
      .join('') || empty('報名關閉後自動產生首輪賽程。');
  return (
    heading('賽事更動', e.name) +
    (staffRefereePrefill?.owner === app.current()?.id && staffRefereePrefill?.eventId === e.id
      ? '<p class="staff-assignment-notice">待指派裁判：' +
        h(staffRefereePrefill.email) +
        '。請開啟對應場次的「裁判指派」並儲存。</p>'
      : '') +
    '<p class="muted-copy">裁判更新的狀態會同步顯示。可調整日期、時間與場地，或將同日同場地後續尚未開始的場次一起延後。</p>' +
    workspaceSearchPanel(
      'changes',
      e,
      '搜尋選手、隊伍、項目、日期、場館、場地、裁判或賽況',
      content,
    ) +
    '<details class="match-correction-log"><summary>比分修正請求與處理紀錄</summary>' +
    auditList(e.id, true) +
    '</details>'
  );
}
function scoreColumn(m, side, measure, disabled) {
  const key = (measure === 'games' ? 'games' : 'score') + side;
  const label = m['team' + side] + (measure === 'games' ? ' 局數' : ' 本局得分');
  return `<div class="flip-counter ${measure === 'games' ? 'small-counter' : 'point-counter'}">
    ${button('', 'score', `data-match="${h(m.id)}" data-side="${side}" data-delta="1" data-measure="${measure}" aria-label="${h(label)}加一" ${disabled}`, 'score-arrow', 'chevron-up')}
    <output aria-live="polite" aria-label="${h(label)}">${m[key]}</output>
    ${button('', 'score', `data-match="${h(m.id)}" data-side="${side}" data-delta="-1" data-measure="${measure}" aria-label="${h(label)}減一" ${disabled}`, 'score-arrow', 'chevron-down')}
  </div>`;
}
function refereeBoard() {
  return refereeWorkspaceView(app.db.matches.filter((m) => m.refereeId === app.current().id));
}
function playerEntries() {
  const entries = app.db.entries.filter((r) => r.userId === app.current().id);
  const events = [...new Set(entries.map((r) => r.eventId))].map((eid) => app.event(eid));
  return (
    heading('我的報名賽事與組別') +
    (events
      .map((e) => {
        const own = entries.filter((r) => r.eventId === e.id);
        const available = registrationAvailable(e) && enrollmentAvailableGroups(e).length > 0;
        return `<article class="competition-card player-event-entry" data-player-event="${h(e.id)}">
      <div class="competition-card-head"><div><strong>${h(e.name)}</strong><p>${h(e.date)} · ${h(e.location)}</p></div>
      ${button('賽事資訊', 'event-detail', `data-event="${h(e.id)}"`, 'text-button')}</div>
      <h3>報名項目／組別</h3><ul class="player-entry-items">${own
        .map(
          (r) => `<li data-player-entry="${h(r.id)}">
        <div><strong>${h(r.group)}</strong><p>選手／隊伍：${h(r.team)}</p></div>
        <span class="entry-status entry-${h(r.status)}">${h({ pending: '審核中', approved: '報名成功', rejected: '審核未通過' }[r.status])}</span>
        ${submittedAnswers(r)}</li>`,
        )
        .join('')}</ul>
      ${available ? button('加報其他項目', 'enroll', `data-event="${h(e.id)}" data-add-group="true"`) : ''}
      </article>`;
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
    <div class="summary-strip"><div><span>已報名賽事</span><strong>${new Set(entries.map((r) => r.eventId)).size}</strong></div><div><span>報名成功項目</span><strong>${entries.filter((r) => r.status === 'approved').length}</strong></div><div><span>審核中項目</span><strong>${entries.filter((r) => r.status === 'pending').length}</strong></div><div><span>球員等級</span><strong>${h(u.level || '未填寫')}</strong></div></div>${playerEntries()}`;
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
    ${field('每場間隔（分鐘）', 'interval', 40, 'number', 'min="1" max="240" required')}</div>
    <label class="form-field">場館與場地清單（每行一個，場館｜場地名稱）<textarea name="locations" rows="4" placeholder="主場館｜中央球場&#10;主場館｜A1&#10;副場館｜東側球場"></textarea></label>
    ${field('外部直播網址（選填）', 'streamUrl', '', 'url', 'placeholder="https://www.youtube.com/watch?v=..."')}
    ${eventGroupsEditor([
      { name: '男子單打', capacity: 16 },
      { name: '女子單打', capacity: 16 },
    ])}
    <button class="primary-button">建立賽事</button></form>`
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
