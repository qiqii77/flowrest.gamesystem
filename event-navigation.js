'use strict';
let routeRestoring = false;
let routeReady = false;
let routeIndex = 0;
let lastRouteKey = '';
let eventDetailId = '';
let eventLookupQuery = '';
const infoFields = [
  ['organizer', '主辦單位', 'text', true],
  ['address', '完整地址 / 交通方式', 'text', true],
  ['contactName', '聯絡窗口', 'text', true],
  ['contactEmail', '聯絡 Email', 'email', true],
  ['contactPhone', '聯絡電話', 'tel', true],
  ['introduction', '賽事介紹', 'textarea', true],
  ['eligibility', '參賽資格與組別說明', 'textarea', true],
  ['rules', '賽制與競賽規則', 'textarea', true],
  ['fees', '報名費用與繳費說明', 'textarea', true],
  ['refunds', '取消與退費規則', 'textarea', true],
  ['notices', '報到流程與注意事項', 'textarea', false],
];
function routeSnapshot() {
  return {
    view,
    activeTab,
    activeSubtab,
    activeEvent,
    publicTab,
    publicEvent,
    eventDetailId,
    editingProfile,
    activeGroup,
    scroll: window.scrollY,
  };
}
function routeKey(s) {
  const { scroll, ...route } = s;
  return JSON.stringify(route);
}
function recordRoute() {
  if (!routeReady || routeRestoring) return;
  const route = routeSnapshot(),
    key = routeKey(route);
  if (key !== lastRouteKey) {
    routeIndex++;
    history.pushState({ ...route, bluecourt: true, index: routeIndex }, '', routeURL(route));
    lastRouteKey = key;
  }
  updateBackButton();
}
function routeURL(route) {
  return (
    location.pathname +
    location.search +
    (route.view === 'event' ? '#event/' + encodeURIComponent(route.eventDetailId) : '')
  );
}
function updateBackButton() {
  const b = $('pageBack');
  if (!b) return;
  b.disabled = routeIndex === 0 && view === 'home';
}
function goBack() {
  if (!$('loginModal').hidden) {
    closeLogin();
    return;
  }
  if (history.state?.bluecourt && history.state.index > 0) history.back();
  else {
    setView('home');
    renderHome();
  }
}
function startRoutes() {
  const requested = location.hash.startsWith('#event/')
    ? decodeURIComponent(location.hash.slice(7))
    : '';
  const saved = history.state?.bluecourt ? history.state : null;
  routeReady = true;
  routeRestoring = true;
  if (requested && app.db.events.some((e) => e.id === requested)) openEventDetails(requested);
  routeRestoring = false;
  const initial = routeSnapshot();
  routeIndex =
    saved &&
    saved.view === initial.view &&
    (initial.view !== 'event' || saved.eventDetailId === initial.eventDetailId)
      ? saved.index
      : 0;
  lastRouteKey = routeKey(initial);
  history.replaceState({ ...initial, bluecourt: true, index: routeIndex }, '', routeURL(initial));
  updateBackButton();
}
window.addEventListener('popstate', (event) => {
  if (!event.state?.bluecourt || !routeReady) return;
  routeRestoring = true;
  const s = event.state;
  activeTab = s.activeTab;
  activeSubtab = s.activeSubtab;
  activeEvent = s.activeEvent;
  publicTab = s.publicTab;
  publicEvent = s.publicEvent;
  eventDetailId = s.eventDetailId;
  editingProfile = s.editingProfile;
  activeGroup = s.activeGroup;
  routeIndex = s.index;
  closeLogin();
  closeModal();
  setView(s.view === 'workspace' && !app.current() ? 'home' : s.view, false);
  refresh();
  lastRouteKey = routeKey(routeSnapshot());
  routeRestoring = false;
  updateBackButton();
  window.scrollTo({ top: s.scroll || 0, behavior: 'auto' });
});
function openEventDetails(eid) {
  app.event(eid);
  eventDetailId = eid;
  setView('event');
  renderEventDetails();
}
function renderEventDetails() {
  const e = app.event(eventDetailId),
    info = e.info || {};
  const phase = BlueCourtDemo.eventPhase(e, app.db.matches);
  $('workspaceRoleLabel').textContent = '賽事專屬資訊';
  $('workspaceTitle').textContent = e.name;
  $('workspaceContent').innerHTML = `<article class="event-detail-page">
    <span class="event-phase phase-${phase.key}">${h(phase.label)}</span>
    <dl class="event-facts"><div><dt>比賽時間</dt><dd>${h(e.date)} ${h(e.time)}</dd></div>
    <div><dt>比賽項目</dt><dd>${h(e.groups.join('、'))}</dd></div>
    <div><dt>比賽地點</dt><dd>${h(e.location)}</dd></div>
    <div><dt>報名截止</dt><dd>${h(e.deadline)}</dd></div></dl>
    <div class="inline-actions">${phase.canEnroll ? button('立即報名', 'enroll', 'data-event="' + h(e.id) + '"', 'primary-button') : ''}
    ${button('查看當日賽況', 'today-live', 'data-event="' + h(e.id) + '"')}
    ${button('查看完整賽程', 'all-schedule', 'data-event="' + h(e.id) + '"')}</div>
    ${infoFields.map(([key, label]) => `<section class="event-info-section"><h2>${h(label)}</h2><p>${h(info[key] || '主辦單位尚未提供，請留意後續公告。')}</p></section>`).join('')}
    </article>`;
  recordRoute();
}
function eventInfoEditor(e) {
  const info = e.info || {};
  return (
    heading('賽事資訊', e.name) +
    `<p class="muted-copy">儲存後將同步公開賽事資訊頁；比賽項目與報名欄位請至表單管理設定，已排定的場次請至賽事更動調整。</p>
    <form class="workflow-form event-info-form" data-form="event-info" data-event="${h(e.id)}">
    <h3>基本資訊</h3>
    ${field('比賽名稱 *', 'name', e.name, 'text', 'required maxlength="150"')}
    ${field('比賽地點 *', 'location', e.location, 'text', 'required maxlength="300"')}
    ${field('比賽日期 *', 'date', e.date, 'date', 'required')}
    ${field('開始時間 *', 'time', e.time, 'time', 'required')}
    ${field('報名截止日期 *', 'deadline', e.deadline, 'date', 'required')}
    <h3>活動說明與聯絡方式</h3>
    ${infoFields
      .map(([key, label, type, required]) =>
        type === 'textarea'
          ? `<label class="form-field">${h(label)}${required ? ' *' : ''}<textarea name="${key}" rows="4" maxlength="10000" ${required ? 'required' : ''}>${h(info[key] || '')}</textarea></label>`
          : field(
              label + (required ? ' *' : ''),
              key,
              info[key] || '',
              type,
              (required ? 'required ' : '') + 'maxlength="500"',
            ),
      )
      .join('')}
    <button class="primary-button" type="submit">儲存賽事資訊</button>
    ${button('查看公開資訊頁', 'event-detail', 'data-event="' + h(e.id) + '"')}</form>`
  );
}
function registeredAccountSearch(users, current = '', disabled = false, required = false) {
  return `<div class="account-search-control">
    <label class="form-field">搜尋已註冊帳號（姓名或 Email）
    <input name="email" type="text" value="${h(current)}" autocomplete="off" maxlength="254"
      data-account-search aria-label="搜尋已註冊帳號" ${disabled ? 'disabled' : ''} ${required ? 'required' : ''}
      placeholder="輸入姓名或 Email 查找，點選搜尋結果"></label>
    <div class="account-search-results" role="group" aria-label="符合的已註冊帳號" hidden
      data-accounts="${h(JSON.stringify(users.map((u) => ({ name: u.name, email: u.email }))))}"></div>
    <p class="muted-copy">${required ? '請輸入完整 Email 或點選符合的帳號。' : '請輸入完整 Email 或點選符合的帳號；清空後儲存可解除指派。'}</p></div>`;
}
function searchAccounts(input) {
  const results = input.closest('.account-search-control').querySelector('.account-search-results');
  const tokens = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  results.hidden = !tokens.length;
  if (!tokens.length) return;
  const users = JSON.parse(results.dataset.accounts).filter((u) =>
    tokens.every((t) => (u.name + ' ' + u.email).toLocaleLowerCase().includes(t)),
  );
  results.innerHTML = users.length
    ? users
        .slice(0, 20)
        .map(
          (u) =>
            `<button type="button" class="account-search-result" data-account-email="${h(u.email)}"><strong>${h(u.name)}</strong><span>${h(u.email)}</span></button>`,
        )
        .join('')
    : '<p role="status">找不到符合的已註冊帳號。</p>';
}
function applyEventLookup(input) {
  eventLookupQuery = input.value;
  const tokens = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const select = input.closest('.event-lookup').querySelector('select');
  const matched = app
    .managedEvents()
    .filter((e) =>
      tokens.every((t) =>
        [e.name, e.sport, e.location, e.date, ...e.groups]
          .join(' ')
          .toLocaleLowerCase()
          .includes(t),
      ),
    );
  select.innerHTML =
    (matched.some((e) => e.id === activeEvent)
      ? ''
      : '<option value="" selected disabled>請選擇搜尋結果</option>') +
    options(
      matched.map((e) => [e.id, e.name]),
      activeEvent,
    );
  select.disabled = !matched.length;
  input.closest('.event-lookup').querySelector('[data-event-lookup-count]').textContent =
    matched.length ? '找到 ' + matched.length + ' 個賽事，選取後切換。' : '沒有符合條件的賽事。';
}
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-account-search]')) searchAccounts(event.target);
  if (event.target.matches('[data-event-lookup]')) applyEventLookup(event.target);
});
document.addEventListener('click', (event) => {
  const result = event.target.closest('[data-account-email]');
  if (result) {
    const control = result.closest('.account-search-control'),
      input = control.querySelector('input');
    input.value = result.dataset.accountEmail;
    control.querySelector('.account-search-results').hidden = true;
    input.focus();
  }
});
document.addEventListener('keydown', (event) => {
  const card = event.target.closest('.event-card[data-command]');
  if (card && event.target === card && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    card.click();
  }
});

document.getElementById('pageBack').addEventListener('click', goBack);
