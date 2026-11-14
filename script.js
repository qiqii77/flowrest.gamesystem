'use strict';
const app = new BlueCourt.CompetitionStore();
let view = 'home',
  activeTab = '',
  activeSubtab = '',
  activeEvent = '',
  editingProfile = false;
let activeGroup = '',
  activeFilter = 'all',
  pendingEnrollment = sessionStorage.getItem('bluecourt-enrollment') || '',
  modalAction = null,
  modalReturnFocus = null;
let publicTab = 'live';
let previewSchemaConfig = null;
const tabSets = {
  admin: [
    ['events', '賽事管理'],
    ['create', '賽事登錄'],
    ['forms', '表單管理'],
    ['users', '使用者管理'],
    ['profile', '個人資料'],
  ],
  manager: [
    ['overview', '賽事總覽'],
    ['changes', '賽事更動'],
    ['review', '報名審核'],
    ['personnel', '人員管理'],
    ['forms', '表單管理'],
    ['profile', '個人資料'],
  ],
  referee: [
    ['scoreboard', '管理報到與分數'],
    ['profile', '個人資料'],
  ],
  player: [
    ['center', '個人中心'],
    ['schedule', '我的賽程'],
    ['entries', '報名與隊伍'],
    ['profile', '個人資料'],
  ],
};
function notice(message, error = false) {
  $('appNotice').textContent = message;
  $('appNotice').classList.toggle('error', error);
  $('appNotice').hidden = false;
}
function handleError(error) {
  notice(error.message || '操作失敗，請再試一次。', true);
}
function closeNavigation() {
  $('navDropdown').classList.remove('open');
  $('navDropdown').setAttribute('aria-hidden', 'true');
  $('menuToggle').setAttribute('aria-expanded', 'false');
  $('accountMenu').hidden = true;
  $('accountButton').setAttribute('aria-expanded', 'false');
}
function setView(next, scroll = true) {
  view = next;
  $('appNotice').hidden = true;
  $('home').hidden = view !== 'home';
  $('roleWorkspace').hidden = !['workspace', 'public'].includes(view);
  $('registrationPage').hidden = view !== 'register';
  $('enrollmentPage').hidden = view !== 'enrollment';
  document.body.classList.toggle('is-authenticated', view === 'workspace' && !!app.current());
  closeNavigation();
  history.replaceState(null, '', location.pathname + location.search);
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
}
function renderAccount() {
  const user = app.current(),
    role = app.role();
  const account = $('accountButton');
  if (!user) {
    account.textContent = '登入';
    account.classList.remove('is-signed-in');
    return;
  }
  account.innerHTML = `<span class="account-button-content"><span>${h(user.name)}</span><span class="account-caret">▾</span></span>`;
  account.classList.add('is-signed-in');
  $('accountMenuName').textContent = user.name;
  $('accountMenuAvatar').textContent = user.name.slice(0, 2);
  $('accountMenuRole').textContent = BlueCourt.labels[role];
}
function showWorkspace() {
  if (!app.current()) return openLogin();
  activeTab = tabSets[app.role()][0][0];
  activeSubtab = '';
  editingProfile = false;
  setView('workspace');
  renderWorkspace();
}
function renderWorkspace() {
  const user = app.current();
  if (!user) {
    setView('home');
    return;
  }
  const role = app.role(),
    tabs = tabSets[role];
  if (!tabs.some(([key]) => key === activeTab)) activeTab = tabs[0][0];
  $('workspaceRoleLabel').textContent = BlueCourt.labels[role];
  $('workspaceTitle').textContent = '你好，' + user.name;
  const managed = app.managedEvents();
  if (!managed.some((e) => e.id === activeEvent)) activeEvent = managed[0]?.id || '';
  const needPicker =
    (role === 'manager' && activeTab !== 'profile') ||
    (role === 'admin' && ['events', 'forms'].includes(activeTab));
  let content = '';
  if (activeTab === 'profile') content = profileView();
  else if (role === 'player')
    content = (
      { center: playerCenter, schedule: playerSchedule, entries: playerEntries }[activeTab] ||
      playerCenter
    )();
  else if (role === 'referee') content = refereeBoard();
  else if (role === 'manager') {
    if (!managed.length) content = empty('目前沒有負責的賽事。');
    else {
      const e = app.event(activeEvent);
      content = (
        {
          overview: eventSummary,
          changes: matchChanges,
          review: registrationList,
          personnel,
          forms: formManagementView,
        }[activeTab] || eventSummary
      )(e);
    }
  } else if (role === 'admin') {
    if (activeTab === 'create') content = adminEventForm();
    if (activeTab === 'forms')
      content = managed.length
        ? formManagementView(app.event(activeEvent))
        : empty('請先建立賽事。');
    if (activeTab === 'users') {
      if (!['accounts', 'assignments'].includes(activeSubtab)) activeSubtab = 'accounts';
      content = subnav([
        ['accounts', '帳號與系統權限'],
        ['assignments', '賽事管理員與裁判指派'],
      ]);
      content +=
        activeSubtab === 'accounts'
          ? adminUsers()
          : managed.length
            ? eventPicker(managed) + adminAssignments()
            : empty('請先登錄賽事。');
    }
    if (activeTab === 'events') {
      if (!['summary', 'changes', 'review', 'personnel', 'audit'].includes(activeSubtab))
        activeSubtab = 'summary';
      content = subnav([
        ['summary', '全部賽事總覽'],
        ['changes', '賽事更動'],
        ['review', '報名審核'],
        ['personnel', '人員管理'],
        ['audit', '操作紀錄'],
      ]);
      if (managed.length) {
        const e = app.event(activeEvent);
        content +=
          activeSubtab === 'audit'
            ? heading('賽事操作紀錄', e.name) + auditList(e.id)
            : { summary: eventSummary, changes: matchChanges, review: registrationList, personnel }[
                activeSubtab
              ](e);
      } else content += empty('尚無賽事，請先至賽事登錄建立。');
    }
  }
  $('workspaceContent').innerHTML =
    `<nav class="workspace-tabs" aria-label="${h(BlueCourt.labels[role])}功能">${tabs
      .map(
        ([key, label]) =>
          `<button type="button" class="workspace-tab ${activeTab === key ? 'active' : ''}" data-command="tab" data-tab="${key}" aria-current="${activeTab === key ? 'page' : 'false'}">${label}</button>`,
      )
      .join('')}</nav>
    ${needPicker && managed.length ? '<div class="event-picker-row">' + eventPicker(managed) + '</div>' : ''}<section class="workspace-panel active" id="currentPanel">${content}</section>`;
  const editor = document.querySelector('[data-form=registration-settings]');
  if (editor) refreshSchemaOutline(editor);
}
function subnav(items) {
  return `<nav class="workspace-subnav" aria-label="細項功能">${items.map(([key, label]) => button(label, 'subtab', `data-tab="${key}" aria-pressed="${key === activeSubtab}"`)).join('')}</nav>`;
}
function renderHome() {
  const today = BlueCourtDemo.todayDate(),
    query = $('eventSearch').value.trim().toLowerCase(),
    sort = $('eventSort').value;
  let events = app.db.events.filter((e) => {
    const phase = BlueCourtDemo.eventPhase(e, app.db.matches);
    return (
      [e.name, e.location, e.sport, ...e.groups].join(' ').toLowerCase().includes(query) &&
      (activeFilter === 'all' ||
        (activeFilter === 'open' && phase.canEnroll) ||
        activeFilter === phase.key)
    );
  });
  if (sort === 'soonest') events.sort((a, b) => a.date.localeCompare(b.date));
  if (sort === 'popular') events.sort((a, b) => entryCount(b.id) - entryCount(a.id));
  $('eventGrid').innerHTML = events
    .map((e, i) => {
      const phase = BlueCourtDemo.eventPhase(e, app.db.matches);
      return `<article class="event-card" data-event-card="${h(e.id)}"><div class="event-image event-${['one', 'two', 'three'][i % 3]}"></div><div class="event-body">
      <div class="event-topline"><span class="chip neutral">${h(e.sport)}</span><span class="event-phase phase-${phase.key}">${h(phase.label)}</span></div>
      <h3>${h(e.name)}</h3><p>${h(e.date)} · ${h(e.location)}</p><p>${h(e.groups.join('、'))} · ${e.courts} 個場地</p>
      <div class="event-meta"><span>${phase.canEnroll ? '報名中 · 截止 ' + h(e.deadline) : '報名已截止'}</span><span>${entryCount(e.id)} / ${e.capacity} 隊</span></div>
      <div class="inline-actions">${button('賽事資訊', 'event-detail', `data-event="${h(e.id)}"`, 'text-button')}
      ${phase.canEnroll ? button('立即報名', 'enroll', `data-event="${h(e.id)}"`, 'primary-button') : phase.key === 'live' ? button('查看賽況', 'today-live', '', 'primary-button') : ''}</div></div></article>`;
    })
    .join('');
  $('resultsCount').textContent = '共 ' + events.length + ' 場賽事';
  $('emptyResults').hidden = !!events.length;
  const todayMatches = app.db.matches.filter((m) => m.date === today);
  const liveMatches = todayMatches.filter((m) => m.status === 'started');
  const liveEvents = [...new Set(liveMatches.map((m) => m.eventId))].map((eid) => app.event(eid));
  $('liveDate').textContent = today + ' · 台灣時間';
  $('heroScore').innerHTML = liveEvents.length
    ? livePreview(liveEvents[0])
    : empty('今日目前沒有進行中的比賽。');
  $('liveMatchList').innerHTML = liveEvents
    .slice(1)
    .map((e) => livePreview(e))
    .join('');
  $('homeScheduleList').innerHTML =
    app.db.matches
      .slice()
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 6)
      .map((m) => matchCard(m))
      .join('') || empty('目前尚無賽程。');
}
function registrationAvailable(e) {
  return e.registrationOpen && e.deadline >= BlueCourtDemo.todayDate();
}
function entryCount(eid) {
  return app.db.entries.filter((r) => r.eventId === eid).length;
}
function renderPublic() {
  const live = publicTab === 'live';
  $('workspaceRoleLabel').textContent = live
    ? '今日即時賽況 · ' + BlueCourtDemo.todayDate()
    : '公開賽程';
  $('workspaceTitle').textContent = live ? '當日賽事' : '完整賽程';
  const matches = app.db.matches
    .filter((m) => !live || m.date === BlueCourtDemo.todayDate())
    .slice()
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  $('workspaceContent').innerHTML =
    heading(live ? '當日賽事資訊' : '所有賽程') +
    '<div class="inline-actions">' +
    button('當日賽況', 'today-live') +
    button('完整賽程', 'all-schedule') +
    button('返回賽事資訊', 'home-events') +
    '</div>' +
    (matches.map((m) => matchCard(m)).join('') ||
      empty(live ? '今日沒有比賽。' : '目前尚無場次。'));
}
function refresh() {
  renderAccount();
  renderHome();
  if (view === 'workspace') renderWorkspace();
  if (view === 'public') renderPublic();
  if (view === 'enrollment') renderEnrollment();
}
function modal({ title, description, body = '', primary = '', action = null }) {
  $('actionModal').removeAttribute('data-review-entry');
  previewSchemaConfig = null;
  modalReturnFocus = document.activeElement;
  $('actionModalTitle').textContent = title;
  $('actionModalBody').innerHTML = `<p>${h(description)}</p>${body}`;
  $('actionModalPrimary').textContent = primary;
  $('actionModalPrimary').hidden = !primary;
  modalAction = action;
  $('actionModal').hidden = false;
  document.body.classList.add('modal-open');
  $('actionModal').querySelector('input, select, button').focus();
}
function closeModal() {
  $('actionModal').removeAttribute('data-review-entry');
  previewSchemaConfig = null;
  $('actionModal').hidden = true;
  modalAction = null;
  document.body.classList.remove('modal-open');
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
}
function closeLogin() {
  $('loginModal').hidden = true;
  document.body.classList.remove('modal-open');
}
function openLogin() {
  closeNavigation();
  $('appNotice').hidden = true;
  $('loginDescription').textContent = pendingEnrollment
    ? '登入後將繼續填寫剛剛選定賽事的報名資料。還沒有帳號？請先註冊。'
    : '使用電子郵件與密碼登入，系統會依帳號權限進入你的介面。';
  $('loginError').textContent = '';
  $('socialLoginStatus').textContent = '其他帳號連動即將開放，目前可使用電子郵件登入或註冊。';
  $('loginModal').hidden = false;
  document.body.classList.add('modal-open');
  $('loginForm').elements.email.focus();
}
function openRegister() {
  closeLogin();
  setView('register');
  $('registerError').textContent = '';
}
function clearEnrollment() {
  pendingEnrollment = '';
  sessionStorage.removeItem('bluecourt-enrollment');
}
function afterLogin() {
  closeLogin();
  refresh();
  if (pendingEnrollment) {
    const e = app.db.events.find((e) => e.id === pendingEnrollment);
    if (e && registrationAvailable(e)) {
      openEnrollment(e.id);
      return;
    }
    clearEnrollment();
    showWorkspace();
    notice('原選定的賽事已截止報名。', true);
    return;
  }
  showWorkspace();
}
function openEnrollment(eid) {
  const e = app.event(eid);
  if (!registrationAvailable(e)) throw new Error('此賽事已截止報名。');
  pendingEnrollment = eid;
  sessionStorage.setItem('bluecourt-enrollment', eid);
  if (!app.current()) {
    openLogin();
    return;
  }
  if (app.db.entries.some((r) => r.userId === app.current().id && r.eventId === eid)) {
    clearEnrollment();
    showWorkspace();
    if (app.role() === 'player') activeTab = 'entries';
    renderWorkspace();
    notice('你已報名此賽事，無須重複報名。');
    return;
  }
  setView('enrollment');
  renderEnrollment();
}
function renderEnrollment() {
  if (!app.current()) {
    setView('home');
    openLogin();
    return;
  }
  const e = app.db.events.find((e) => e.id === pendingEnrollment);
  if (!e || !registrationAvailable(e)) {
    clearEnrollment();
    setView('home');
    notice('此賽事目前無法報名。', true);
    return;
  }
  $('enrollmentContent').innerHTML = enrollmentView(e, app.current());
  applyRegistrationConditions(
    document.querySelector('[data-form=enrollment]'),
    BlueCourtForms.getConfig(e),
  );
}
function finalConfirmation(mid) {
  const m = app.match(mid),
    revision = m.revision;
  modal({
    title: '確認送出最終比分？',
    description: `${m.teamA} vs ${m.teamB}；局數（大比分）${m.gamesA}：${m.gamesB}，本局得分（小比分）${m.scoreA}：${m.scoreB}。送出後比分將鎖定，無法再次更動；如需修正，請聯絡賽事管理員。`,
    primary: '確認送出並鎖定',
    action: () => {
      app.finalize(mid, revision);
      closeModal();
      notice('最終比分已送出並鎖定。');
    },
  });
}
function reasonModal(mid, kind) {
  modal({
    title: kind === 'unlock' ? '重新開放比分' : '請求比分修正',
    description:
      kind === 'unlock'
        ? '填寫原因後，原裁判可將狀態設為開始並修正比分。'
        : '請描述需要修正的內容，賽事管理員會在此賽事的人員管理看到請求。',
    body: field('原因', 'reason', '', 'text', 'id="correctionReason" required maxlength="500"'),
    primary: '確認送出',
    action: () => {
      const reason = $('correctionReason').value.trim();
      if (!reason) throw new Error('請填寫原因。');
      if (kind === 'unlock') app.unlock(mid, reason);
      else app.requestCorrection(mid, reason);
      closeModal();
      notice('已送出並記錄。');
    },
  });
}
async function runCommand(buttonElement) {
  const b = buttonElement,
    command = b.dataset.command,
    mid = b.dataset.match,
    eid = b.dataset.event;
  switch (command) {
    case 'today-live':
      publicTab = 'live';
      setView('public');
      renderPublic();
      break;
    case 'all-schedule':
      publicTab = 'schedule';
      setView('public');
      renderPublic();
      break;
    case 'select-schema-field':
      refreshSchemaOutline(b.closest('form'), b.dataset.field);
      break;
    case 'schema-panel':
      refreshSchemaOutline(
        b.closest('form'),
        b.closest('[data-schema-row]').dataset.fieldId,
        b.dataset.panel,
      );
      break;
    case 'add-schema-field': {
      const form = b.closest('form'),
        fields = form.querySelector('#schemaFields'),
        draft = readRegistrationSettings(form);
      if (fields.children.length >= 40) throw new Error('最多可設定 40 個題目。');
      const id = 'extra_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20),
        field = { id, label: '新題目', type: 'text', visible: true, required: false, options: [] };
      draft.fields.push(field);
      fields.insertAdjacentHTML(
        'beforeend',
        schemaFieldRow(field, draft.fields.length - 1, draft.fields),
      );
      refreshSchemaOutline(form, id, 'content');
      fields.lastElementChild.querySelector('.schema-label').focus();
      break;
    }
    case 'duplicate-schema-field': {
      const form = b.closest('form'),
        draft = readRegistrationSettings(form),
        row = b.closest('[data-schema-row]');
      if (draft.fields.length >= 40) throw new Error('最多可設定 40 個題目。');
      const index = draft.fields.findIndex((f) => f.id === row.dataset.fieldId),
        field = structuredClone(draft.fields[index]);
      field.id = 'extra_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);
      field.label = field.label.slice(0, 74) + '（副本）';
      draft.fields.splice(index + 1, 0, field);
      row.insertAdjacentHTML('afterend', schemaFieldRow(field, index + 1, draft.fields));
      refreshSchemaOutline(form, field.id, 'content');
      break;
    }
    case 'remove-schema-field': {
      const form = b.closest('form');
      b.closest('[data-schema-row]').remove();
      refreshSchemaOutline(form);
      break;
    }
    case 'move-schema-up':
    case 'move-schema-down': {
      const form = b.closest('form'),
        row = b.closest('[data-schema-row]');
      if (command === 'move-schema-up' && row.previousElementSibling)
        row.previousElementSibling.before(row);
      if (command === 'move-schema-down' && row.nextElementSibling)
        row.nextElementSibling.after(row);
      refreshSchemaOutline(form, row.dataset.fieldId);
      break;
    }
    case 'add-condition': {
      const form = b.closest('form'),
        row = b.closest('[data-schema-row]'),
        rules = row.querySelector('.condition-rules'),
        draft = readRegistrationSettings(form);
      if (rules.children.length >= 8) throw new Error('每題最多 8 個顯示條件。');
      rules.insertAdjacentHTML(
        'beforeend',
        conditionRuleRow(
          {
            source: 'field',
            fieldId: 'group',
            operator: 'eq',
            value: app.event(form.dataset.event).groups[0],
          },
          draft.fields,
          row.dataset.fieldId,
        ),
      );
      refreshSchemaOutline(form, row.dataset.fieldId, 'conditions');
      break;
    }
    case 'remove-condition':
      b.closest('[data-condition-rule]').remove();
      break;
    case 'preview-schema': {
      const form = b.closest('form'),
        draft = BlueCourtForms.sanitizeConfig(readRegistrationSettings(form));
      modal({
        title: '報名表預覽',
        description: '可試填題目，檢查顯示條件；不會送出報名。',
        body:
          '<div class="schema-preview">' +
          enrollmentFields(
            { ...app.event(form.dataset.event), groups: draft.groups },
            app.current(),
            draft,
          ) +
          '</div>',
      });
      previewSchemaConfig = draft;
      applyRegistrationConditions(document.querySelector('.schema-preview'), draft);
      break;
    }
    case 'open-registration':
      openRegistrationDetails(b.dataset.entry);
      break;
    case 'group-filter':
      activeGroup = b.dataset.group;
      renderWorkspace();
      break;
    case 'cancel-enrollment':
      clearEnrollment();
      setView('home');
      $('events').scrollIntoView();
      break;
    case 'tab':
      activeTab = b.dataset.tab;
      activeSubtab = '';
      editingProfile = false;
      renderWorkspace();
      break;
    case 'subtab':
      activeSubtab = b.dataset.tab;
      renderWorkspace();
      break;
    case 'home-events':
      setView('home');
      $('events').scrollIntoView();
      break;
    case 'edit-profile':
      editingProfile = true;
      renderWorkspace();
      break;
    case 'cancel-profile':
      editingProfile = false;
      renderWorkspace();
      break;
    case 'enroll':
      openEnrollment(eid);
      break;
    case 'enrollment-login':
      closeModal();
      openLogin();
      break;
    case 'event-detail': {
      const e = app.event(eid);
      modal({
        title: e.name,
        description: `${e.date} · ${e.location} · ${e.groups.join('、')} · 報名截止 ${e.deadline}`,
        primary: registrationAvailable(e) ? '立即報名' : '查看當日賽況',
        action: () => {
          closeModal();
          if (registrationAvailable(e)) openEnrollment(eid);
          else {
            publicTab = 'live';
            setView('public');
            renderPublic();
          }
        },
      });
      break;
    }
    case 'close-registration':
      modal({
        title: '關閉報名並產生賽程？',
        description:
          '報名關閉後，系統會依各組別已核准隊伍產生首輪配對；奇數隊伍安排輪空。未核准的報名不會排入，關閉後不再接受報名。',
        primary: '確認關閉並排程',
        action: () => {
          app.closeRegistration(eid);
          closeModal();
          notice('已關閉報名並完成首輪配對。');
        },
      });
      break;
    case 'review':
      app.review(b.dataset.entry, b.dataset.status);
      if ($('actionModal').dataset.reviewEntry === b.dataset.entry)
        openRegistrationDetails(b.dataset.entry);
      notice('審核狀態已更新。');
      break;
    case 'status':
      app.setStatus(mid, b.dataset.status);
      break;
    case 'score':
      app.score(mid, b.dataset.side, Number(b.dataset.delta), b.dataset.measure || 'points');
      break;
    case 'reset-all':
    case 'reset':
      modal({
        title: command === 'reset-all' ? '確定將全部比分歸零？' : '確定將本局得分歸零？',
        description:
          command === 'reset-all'
            ? '雙方局數、本局得分與各局紀錄都會清除。'
            : '只將本局得分回到 0：0，保留局數與各局紀錄。',
        primary: '確認歸零',
        action: () => {
          app.resetScore(mid, command === 'reset-all' ? 'all' : 'points');
          closeModal();
        },
      });
      break;
    case 'finish-game': {
      const m = app.match(mid),
        revision = m.revision;
      modal({
        title: '確認記錄本局比分？',
        description:
          m.teamA +
          ' ' +
          m.scoreA +
          '：' +
          m.scoreB +
          ' ' +
          m.teamB +
          '。勝方局數加一，保留各局紀錄，本局得分回到零。',
        primary: '記錄本局',
        action: () => {
          app.finishGame(mid, revision);
          closeModal();
        },
      });
      break;
    }
    case 'finalize':
      finalConfirmation(mid);
      break;
    case 'unlock':
      reasonModal(mid, 'unlock');
      break;
    case 'correction':
      reasonModal(mid, 'correction');
      break;
    case 'admin-role': {
      const user = app.db.users.find((u) => u.id === b.dataset.user);
      modal({
        title: '確認變更系統管理員權限？',
        description:
          user.email +
          (user.admin ? ' 將失去所有賽事的系統管理權限。' : ' 將能管理全部賽事與使用者權限。'),
        primary: '確認變更',
        action: () => {
          app.setAdmin(user.id, !user.admin);
          closeModal();
        },
      });
      break;
    }
  }
}
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-command]');
  if (target && !target.disabled) {
    Promise.resolve(runCommand(target)).catch(handleError);
    return;
  }
  if (!event.target.closest('.account-area')) {
    $('accountMenu').hidden = true;
    $('accountButton').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('change', (event) => {
  try {
    const el = event.target;
    if (el.classList.contains('condition-enabled')) {
      const row = el.closest('[data-schema-row]');
      row.querySelector('.condition-settings').hidden = !el.checked;
      if (el.checked && !row.querySelector('[data-condition-rule]'))
        row.querySelector('[data-command=add-condition]').click();
    }
    if (
      el.closest('[data-condition-rule]') &&
      ['condition-source', 'condition-operator'].some((c) => el.classList.contains(c))
    )
      updateConditionRule(el.closest('[data-condition-rule]'));
    if (el.classList.contains('schema-type'))
      el.closest('[data-schema-row]').querySelector('.schema-option-field').hidden =
        el.value !== 'select';
    if (el.classList.contains('schema-visible') && !el.checked)
      el.closest('[data-schema-row]').querySelector('.schema-required').checked = false;
    if (el.classList.contains('schema-required') && el.checked)
      el.closest('[data-schema-row]').querySelector('.schema-visible').checked = true;
    if (el.name === 'paymentMode')
      el.closest('form').querySelector('[data-payment-details]').hidden = el.value !== 'planned';
    if (el.id === 'event-select') {
      activeEvent = el.value;
      renderWorkspace();
    }
    if (el.closest('[data-form=registration-settings]')) refreshSchemaOutline(el.closest('form'));
    updateApplicantConditionUI(el);
    if (el.dataset.checkin) app.checkin(el.dataset.checkin, el.dataset.side, el.checked);
  } catch (error) {
    handleError(error);
    refresh();
  }
});
function updateApplicantConditionUI(target) {
  const form = target.closest('[data-form=enrollment]');
  if (form)
    applyRegistrationConditions(form, BlueCourtForms.getConfig(app.event(form.dataset.event)));
  const preview = target.closest('.schema-preview');
  if (preview && previewSchemaConfig) applyRegistrationConditions(preview, previewSchemaConfig);
}
document.addEventListener('input', (event) => {
  const target = event.target;
  updateApplicantConditionUI(target);
  if (target.classList.contains('schema-label')) refreshSchemaOutline(target.closest('form'));
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    switch (form.dataset.form) {
      case 'registration-settings':
        app.saveRegistrationForm(form.dataset.event, readRegistrationSettings(form));
        notice('表單設定已儲存，報名頁已同步更新。');
        break;
      case 'stream':
        app.updateStream(form.dataset.event, data.streamUrl);
        notice('直播網址已更新。');
        break;
      case 'enrollment':
        app.enroll(form.dataset.event, data);
        clearEnrollment();
        showWorkspace();
        if (app.role() === 'player') {
          activeTab = 'entries';
          renderWorkspace();
        }
        notice('報名成功，等待賽事管理員審核。');
        break;
      case 'profile':
        app.updateProfile(data);
        editingProfile = false;
        renderWorkspace();
        notice('個人資料已儲存。');
        break;
      case 'referee':
        app.assignReferee(form.dataset.match, data.email);
        notice('裁判指派已更新。');
        break;
      case 'manager':
        app.assignManager(form.dataset.event, data.email, data.operation === 'remove');
        notice('賽事管理員權限已更新。');
        break;
      case 'match':
        app.changeMatch(form.dataset.match, data);
        notice('賽事更動已同步。');
        break;
      case 'event': {
        const e = app.createEvent(data);
        activeEvent = e.id;
        activeTab = 'events';
        activeSubtab = 'summary';
        renderWorkspace();
        notice('賽事已建立，可至使用者管理指派賽事管理員。');
        break;
      }
    }
  } catch (error) {
    handleError(error);
  }
});
$('accountButton').addEventListener('click', () => {
  if (!app.current()) return openLogin();
  $('accountMenu').hidden = !$('accountMenu').hidden;
  $('accountButton').setAttribute('aria-expanded', String(!$('accountMenu').hidden));
});
$('openProfile').addEventListener('click', showWorkspace);
$('menuSignOut').addEventListener('click', () => {
  closeLogin();
  closeModal();
  clearEnrollment();
  app.logout();
  setView('home');
  refresh();
  notice('已登出。');
});
$('brandHome').addEventListener('click', (event) => {
  event.preventDefault();
  setView('home');
});
$('menuToggle').addEventListener('click', () => {
  const open = $('navDropdown').classList.toggle('open');
  $('navDropdown').setAttribute('aria-hidden', String(!open));
  $('menuToggle').setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.nav-link,.nav-dropdown a').forEach((link) =>
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setView('home');
    if (link.dataset.eventFilter) {
      activeFilter = link.dataset.eventFilter;
      renderHome();
      document
        .querySelectorAll('[data-filter]')
        .forEach((button) =>
          button.classList.toggle('active', button.dataset.filter === activeFilter),
        );
    }
    document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
  }),
);
document.querySelectorAll('[data-action="register"]').forEach((b) =>
  b.addEventListener('click', () => {
    setView('home');
    $('events').scrollIntoView();
  }),
);
document.querySelectorAll('[data-action="schedule"]').forEach((b) =>
  b.addEventListener('click', () => {
    setView('public');
    renderPublic();
  }),
);
document.querySelectorAll('[data-public-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    publicTab = b.dataset.publicTab;
    setView('public');
    renderPublic();
  }),
);
document
  .querySelectorAll('[data-close-modal]')
  .forEach((b) => b.addEventListener('click', closeLogin));
$('loginModalBrand').addEventListener('click', (event) => {
  event.preventDefault();
  closeLogin();
  setView('home');
});
$('registrationBrandHome').addEventListener('click', (event) => {
  event.preventDefault();
  setView('home');
});
$('showRegister').addEventListener('click', openRegister);
$('registrationLogin').addEventListener('click', () => openLogin());
document.querySelectorAll('[data-social-login]').forEach((button) => {
  button.addEventListener('click', () => {
    $('socialLoginStatus').textContent =
      button.dataset.socialLogin + ' 帳號連動尚未開放，請先使用電子郵件登入或註冊。';
  });
});
$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget,
    button = $('submitLogin');
  button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    await app.login(data.email, data.password);
    form.reset();
    afterLogin();
  } catch (error) {
    $('loginError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget,
    button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await app.register(Object.fromEntries(new FormData(form)));
    form.reset();
    afterLogin();
    notice('註冊成功，已建立選手帳號。');
  } catch (error) {
    $('registerError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$('actionModalPrimary').addEventListener('click', async () => {
  const button = $('actionModalPrimary');
  button.disabled = true;
  try {
    await modalAction?.();
  } catch (error) {
    handleError(error);
  } finally {
    button.disabled = false;
  }
});
document
  .querySelectorAll('[data-action-close]')
  .forEach((b) => b.addEventListener('click', closeModal));
for (const [id, close] of [
  ['loginModal', closeLogin],
  ['actionModal', closeModal],
])
  $(id).addEventListener('click', (event) => {
    if (event.target === $(id)) close();
  });
document.addEventListener('keydown', (event) => {
  const dialog = !$('actionModal').hidden
    ? $('actionModal')
    : !$('loginModal').hidden
      ? $('loginModal')
      : null;
  if (event.key === 'Escape') {
    if (dialog?.id === 'actionModal') closeModal();
    else if (dialog) closeLogin();
    closeNavigation();
  }
  if (event.key === 'Tab' && dialog) {
    const focusable = [...dialog.querySelectorAll('button,input,select,a[href]')].filter(
      (el) => !el.disabled && el.getClientRects().length,
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
$('eventSearch').addEventListener('input', renderHome);
$('eventSort').addEventListener('change', renderHome);
document.querySelectorAll('[data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    activeFilter = b.dataset.filter;
    document
      .querySelectorAll('[data-filter]')
      .forEach((el) => el.classList.toggle('active', el === b));
    renderHome();
  }),
);
window.addEventListener('storage', (event) => {
  if (![BlueCourt.KEY, BlueCourt.SESSION, null].includes(event.key)) return;
  try {
    const oldUser = app.current()?.id,
      oldRole = app.role();
    const focused = document.activeElement;
    const form = focused?.closest('form[data-form]');
    const draft = form
      ? {
          kind: form.dataset.form,
          match: form.dataset.match,
          event: form.dataset.event,
          values: Object.fromEntries(new FormData(form)),
          schema:
            form.dataset.form === 'registration-settings' ? readRegistrationSettings(form) : null,
          selectedField: form.dataset.selectedField,
          editorPanel: form.dataset.editorPanel,
          schemaFocus: focused.closest('[data-schema-row]')
            ? {
                id: focused.closest('[data-schema-row]').dataset.fieldId,
                kind: [
                  'schema-label',
                  'schema-type',
                  'schema-options',
                  'schema-visible',
                  'schema-required',
                ].find((key) => focused.classList.contains(key)),
              }
            : null,
          focus: focused.name,
          start: focused.selectionStart,
          end: focused.selectionEnd,
        }
      : null;
    app.load();
    if ($('actionModal').dataset.reviewEntry) {
      const entry = app.db.entries.find((r) => r.id === $('actionModal').dataset.reviewEntry);
      if (!entry || !app.canManage(entry.eventId)) closeModal();
    }
    refresh();
    if (draft && app.current()?.id === oldUser && app.role() === oldRole) {
      const nextForm = [...document.querySelectorAll('form[data-form]')].find(
        (f) =>
          f.dataset.form === draft.kind &&
          f.dataset.match === draft.match &&
          f.dataset.event === draft.event,
      );
      if (nextForm) {
        if (draft.schema)
          nextForm.querySelector('#schemaFields').innerHTML = draft.schema.fields
            .map(schemaFieldRow)
            .join('');
        for (const [key, value] of Object.entries(draft.values))
          if (nextForm.elements[key]) nextForm.elements[key].value = value;
        if (draft.schema) {
          for (const checkbox of nextForm.querySelectorAll('[name=paymentMethods]'))
            checkbox.checked = draft.schema.payment.methods.includes(checkbox.value);
          nextForm.querySelector('[data-payment-details]').hidden =
            draft.schema.payment.mode !== 'planned';
          nextForm.elements.externalEnabled.checked = !!draft.schema.external?.enabled;
          refreshSchemaOutline(
            nextForm,
            draft.schemaFocus?.id || draft.selectedField,
            draft.editorPanel,
          );
        }
        const nextInput = draft.schemaFocus?.kind
          ? nextForm.querySelector(
              '[data-field-id="' +
                CSS.escape(draft.schemaFocus.id) +
                '"] .' +
                draft.schemaFocus.kind,
            )
          : nextForm.elements[draft.focus];
        nextInput?.focus();
        if (nextInput && draft.start !== null && ['text', 'tel', 'search'].includes(nextInput.type))
          nextInput.setSelectionRange(draft.start, draft.end);
      }
    }
    notice(draft ? '資料已同步；尚未送出的表單內容已保留。' : '賽事與帳號資料已同步更新。');
  } catch (error) {
    handleError(error);
  }
});
app.onchange = () => {
  if (app.db) refresh();
};
(async () => {
  try {
    await app.init();
    app.expireRegistrations();
    refresh();
    $('appLoading').hidden = true;
    if (app.current() && pendingEnrollment) openEnrollment(pendingEnrollment);
    else if (app.current()) showWorkspace();
    else if (pendingEnrollment) openLogin();
  } catch (error) {
    $('appLoading').textContent = '無法載入本機資料：' + error.message;
    handleError(error);
  }
})();

$('appNotice').addEventListener('click', () => {
  $('appNotice').hidden = true;
});
window.setInterval(() => {
  try {
    app.expireRegistrations();
    renderHome();
    if (view === 'public') renderPublic();
    if (view === 'enrollment')
      updateApplicantConditionUI(document.querySelector('[data-form=enrollment]'));
    if (previewSchemaConfig)
      applyRegistrationConditions(document.querySelector('.schema-preview'), previewSchemaConfig);
  } catch (error) {
    handleError(error);
  }
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    try {
      app.expireRegistrations();
      renderHome();
      if (view === 'public') renderPublic();
      if (view === 'enrollment')
        updateApplicantConditionUI(document.querySelector('[data-form=enrollment]'));
      if (previewSchemaConfig)
        applyRegistrationConditions(document.querySelector('.schema-preview'), previewSchemaConfig);
    } catch (error) {
      handleError(error);
    }
  }
});
