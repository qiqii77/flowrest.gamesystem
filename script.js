const menuToggle = document.getElementById('menuToggle');
const navDropdown = document.getElementById('navDropdown');
const navLinks = document.querySelectorAll('.nav-link');
const eventGrid = document.getElementById('eventGrid');
const eventSort = document.getElementById('eventSort');
const eventSearch = document.getElementById('eventSearch');
const filterButtons = document.querySelectorAll('.filter-chip[data-filter]');
const resultsCount = document.getElementById('resultsCount');
const emptyResults = document.getElementById('emptyResults');
const accountButton = document.getElementById('accountButton');
const accountMenu = document.getElementById('accountMenu');
const loginModal = document.getElementById('loginModal');
const loginView = document.getElementById('loginView');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const demoLogin = document.getElementById('demoLogin');
const roleWorkspace = document.getElementById('roleWorkspace');
const homePage = document.getElementById('home');
const brandHome = document.getElementById('brandHome');
const profilePage = document.getElementById('profilePage');
const workspaceHeading = document.querySelector('.workspace-heading');
const registrationPage = document.getElementById('registrationPage');
const roleChoices = document.querySelectorAll('.role-choice');
const dashboards = document.querySelectorAll('[data-dashboard]');
const portalTabs = document.querySelectorAll('[data-portal-tab]');
const portalPanels = document.querySelectorAll('[data-portal-panel]');
const roleDetails = {
  player: { label: '選手中心', description: '登入後查看個人報名狀態、隊伍資訊和下一場賽程。', demoEmail: 'player@bluecourt.tw', name: '王立晨' },
  staff: { label: '工作人員後台', description: '登入後管理賽事、報名審核、現場報到和裁判計分。', demoEmail: 'staff@bluecourt.tw', name: '賽事管理員' },
  audience: { label: '觀眾賽況', description: '登入後追蹤關注賽事、即時比分和每日賽程；公開賽況仍可免登入瀏覽。', demoEmail: 'fan@bluecourt.tw', name: '賽事觀眾' },
};
let activeFilter = 'all';
let selectedRole = 'player';
let actionConfirmHandler = null;

if (menuToggle && navDropdown) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navDropdown.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    navDropdown.setAttribute('aria-hidden', String(!isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navLinks.forEach((item) => item.classList.toggle('active', item === link));
    navigateToSection(link.getAttribute('href').slice(1));
    navDropdown?.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    navDropdown?.setAttribute('aria-hidden', 'true');
  });
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('.nav-dropdown a[href^="#"]:not([data-open-role])');
  if (!link) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  navigateToSection(link.getAttribute('href').slice(1));
  navDropdown?.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  navDropdown?.setAttribute('aria-hidden', 'true');
}, true);

document.querySelectorAll('[data-action="register"]').forEach((button) => {
  button.addEventListener('click', () => openRegistration('player'));
});

document.querySelectorAll('[data-action="schedule"]').forEach((button) => {
  button.addEventListener('click', () => navigateToSection('schedule'));
});

document.querySelectorAll('[data-public-tab]').forEach((button) => {
  button.addEventListener('click', () => showPublicPanel(button.dataset.publicTab ?? 'audience-live'));
});

document.querySelectorAll('[data-live-detail]').forEach((button) => {
  button.addEventListener('click', () => openLiveDetails(button.dataset.liveDetail ?? ''));
});

document.querySelectorAll('[data-event-detail]').forEach((button) => {
  button.addEventListener('click', () => {
    const card = button.closest('.event-card');
    if (card) openEventDetails(card);
  });
});

document.querySelectorAll('[data-open-role]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    selectedRole = link.dataset.openRole ?? 'staff';
    const roleChoice = document.querySelector(`[data-login-role="${selectedRole}"]`);
    roleChoice?.click();
    if (loginView) loginView.hidden = false;
    if (loginModal) loginModal.hidden = false;
    document.body.classList.add('modal-open');
  });
});

function updateEvents() {
  if (!eventGrid) return;

  const query = eventSearch?.value.trim().toLocaleLowerCase() ?? '';
  const cards = [...eventGrid.querySelectorAll('.event-card')];
  const visibleCards = cards.filter((card) => {
    const matchesText = card.dataset.name?.toLocaleLowerCase().includes(query) ?? false;
    const matchesFilter = activeFilter === 'all' || card.dataset.status === activeFilter;
    card.hidden = !matchesText || !matchesFilter;
    return !card.hidden;
  });

  const sortBy = eventSort?.value ?? 'recommended';
  const sortValue = {
    recommended: (card) => Number(card.dataset.recommended),
    soonest: (card) => Number(card.dataset.start),
    popular: (card) => Number(card.dataset.popularity) * -1,
    rating: (card) => Number(card.dataset.rating) * -1,
  }[sortBy];

  visibleCards.sort((first, second) => sortValue(first) - sortValue(second));
  visibleCards.forEach((card) => eventGrid.append(card));
  if (resultsCount) resultsCount.textContent = `共 ${visibleCards.length} 場賽事`;
  if (emptyResults) emptyResults.hidden = visibleCards.length > 0;
}

eventSort?.addEventListener('change', updateEvents);
eventSearch?.addEventListener('input', updateEvents);
filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter ?? 'all';
    filterButtons.forEach((item) => item.classList.toggle('active', item === button));
    updateEvents();
  });
});

function showPortalPanel(panelId) {
  portalTabs.forEach((tab) => {
    const active = tab.dataset.portalTab === panelId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  portalPanels.forEach((panel) => {
    const active = panel.dataset.portalPanel === panelId;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function showActionModal({ title, description, primaryLabel = '', onConfirm = null, buildBody = null }) {
  const modal = document.getElementById('actionModal');
  const titleElement = document.getElementById('actionModalTitle');
  const body = document.getElementById('actionModalBody');
  const primary = document.getElementById('actionModalPrimary');
  if (!modal || !titleElement || !body || !primary) return;

  titleElement.textContent = title;
  body.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  body.append(paragraph);
  buildBody?.(body);
  primary.textContent = primaryLabel;
  primary.hidden = !primaryLabel;
  actionConfirmHandler = onConfirm;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeActionModal() {
  const modal = document.getElementById('actionModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
  actionConfirmHandler = null;
}

function navigateToSection(sectionId) {
  if (!document.getElementById(sectionId)) return;
  if (homePage) homePage.hidden = false;
  if (roleWorkspace) roleWorkspace.hidden = true;
  if (registrationPage) registrationPage.hidden = true;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  window.setTimeout(() => { location.hash = sectionId; }, 0);
}

function openRegistration(role = 'player') {
  selectedRole = role in roleDetails ? role : 'player';
  const registrationRole = document.getElementById('registrationRole');
  if (registrationRole) registrationRole.value = selectedRole;
  if (homePage) homePage.hidden = true;
  if (roleWorkspace) roleWorkspace.hidden = true;
  if (registrationPage) registrationPage.hidden = false;
  if (loginModal) loginModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function showPublicPanel(panelId) {
  if (homePage) homePage.hidden = true;
  if (roleWorkspace) roleWorkspace.hidden = false;
  if (profilePage) profilePage.hidden = true;
  if (workspaceHeading) workspaceHeading.hidden = false;
  dashboards.forEach((dashboard) => { dashboard.hidden = dashboard.id !== 'audienceDashboard'; });
  const roleLabel = document.getElementById('workspaceRoleLabel');
  const workspaceTitle = document.getElementById('workspaceTitle');
  if (roleLabel) roleLabel.textContent = '公開資訊';
  if (workspaceTitle) workspaceTitle.textContent = '賽事即時資訊';
  showPortalPanel(panelId);
}

function openLiveDetails(matchKey) {
  const matchContent = {
    'men-doubles': ['男子雙打準決賽', '第 6 場地 · Alpha / Bravo 10 : 8 Charlie / Delta。直播串流尚未串接，公開比分與賽程可直接查看。'],
    'women-singles': ['城市公開賽女子單打', '第 3 場地正在進行中，比分資訊以公開賽況頁為準。直播串流尚未串接。'],
    final: ['週末總決賽', '今日 17:30 開始，冠軍賽預計提供直播入口。'],
  }[matchKey] ?? ['公開賽況', '查看目前賽事比分與場次資訊。'];
  showActionModal({
    title: matchContent[0],
    description: matchContent[1],
    primaryLabel: '前往即時賽況',
    onConfirm: () => { closeActionModal(); showPublicPanel('audience-live'); },
  });
}

function openEventDetails(card) {
  const eventName = card.querySelector('h3')?.textContent?.trim() ?? '賽事資訊';
  const eventInfo = card.querySelector('.event-body > p')?.textContent?.trim() ?? '';
  const status = card.dataset.status;
  const followedEvents = JSON.parse(localStorage.getItem('bluecourt-followed-events') ?? '[]');
  const isFollowed = followedEvents.includes(eventName);
  showActionModal({
    title: eventName,
    description: `${eventInfo}。${status === 'live' ? '賽事進行中，可查看公開比分。' : status === 'open' ? '目前開放報名。' : '賽事即將開始。'}`,
    primaryLabel: status === 'open' ? '立即報名' : isFollowed ? '取消追蹤' : '追蹤賽事',
    onConfirm: () => {
      if (status === 'open') {
        closeActionModal();
        openRegistration('player');
        return;
      }
      const current = JSON.parse(localStorage.getItem('bluecourt-followed-events') ?? '[]');
      const next = current.includes(eventName) ? current.filter((name) => name !== eventName) : [...current, eventName];
      localStorage.setItem('bluecourt-followed-events', JSON.stringify(next));
      closeActionModal();
    },
  });
}

function readLocalList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function renderCreatedEvents() {
  const list = document.getElementById('createdEventList');
  const counter = document.getElementById('createdEventCount');
  if (!list || !counter) return;
  const events = readLocalList('bluecourt-managed-events');
  list.replaceChildren();
  counter.textContent = `${events.length} 場`;
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '尚未建立賽事。';
    list.append(empty);
    return;
  }

  events.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'created-event-row';
    row.dataset.eventId = event.id;
    const name = document.createElement('strong');
    name.textContent = event.name;
    const venue = document.createElement('span');
    venue.textContent = `${event.location} · ${event.courts} 面場地`;
    const groups = document.createElement('span');
    groups.textContent = event.groups.join('、');
    const remove = document.createElement('button');
    remove.className = 'remove-generated-item';
    remove.type = 'button';
    remove.dataset.removeEvent = event.id;
    remove.textContent = '移除';
    row.append(name, venue, groups, remove);
    list.append(row);
  });

  const eventSelect = document.querySelector('#staffScheduleForm select[name="event"]');
  if (eventSelect) {
    const selected = eventSelect.value;
    eventSelect.replaceChildren(new Option('冬季盃', '冬季盃'));
    events.forEach((event) => {
      const option = new Option(event.name, event.name);
      option.dataset.date = event.date;
      option.dataset.courts = String(event.courts);
      eventSelect.add(option);
    });
    if ([...eventSelect.options].some((option) => option.value === selected)) eventSelect.value = selected;
  }
}

function renderGeneratedSchedule() {
  const list = document.getElementById('generatedScheduleList');
  const counter = document.getElementById('generatedMatchCount');
  if (!list || !counter) return;
  const matches = readLocalList('bluecourt-managed-schedule');
  list.replaceChildren();
  counter.textContent = `${matches.length} 場`;
  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '填入隊伍並產生賽程。';
    list.append(empty);
    return;
  }

  matches.forEach((match) => {
    const row = document.createElement('div');
    row.className = 'generated-match-row';
    row.dataset.matchId = match.id;
    const time = document.createElement('span');
    time.textContent = `${match.date} · ${match.time}`;
    const teams = document.createElement('strong');
    teams.textContent = `${match.teamA} vs ${match.teamB}`;
    const meta = document.createElement('span');
    meta.textContent = `${match.event} · ${match.group} · 第 ${match.court} 場地`;
    const remove = document.createElement('button');
    remove.className = 'remove-generated-item';
    remove.type = 'button';
    remove.dataset.removeMatch = match.id;
    remove.textContent = '移除';
    row.append(time, teams, meta, remove);
    list.append(row);
  });
}

function setSignedIn(email = roleDetails[selectedRole].demoEmail, role = selectedRole, requestedName = '') {
  selectedRole = role in roleDetails ? role : 'player';
  const details = roleDetails[selectedRole];
  const savedAccount = getSavedAccount();
  const savedName = savedAccount?.email === email ? savedAccount.displayName : '';
  const preferredName = requestedName || savedName || '';
  const accountName = preferredName && !/^\d+$/.test(preferredName) && preferredName !== email.split('@')[0]
    ? preferredName
    : details.name;
  const avatar = savedAccount?.email === email && savedAccount.photo
    ? savedAccount.photo
    : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&h=240&q=85';
  const activeDashboard = document.getElementById(`${selectedRole}Dashboard`);
  dashboards.forEach((dashboard) => { dashboard.hidden = dashboard !== activeDashboard; });
  if (profilePage) profilePage.hidden = true;
  if (workspaceHeading) workspaceHeading.hidden = false;
  if (homePage) homePage.hidden = true;
  if (roleWorkspace) roleWorkspace.hidden = false;
  if (registrationPage) registrationPage.hidden = true;
  if (loginView) loginView.hidden = true;
  if (loginForm) loginForm.hidden = false;
  if (loginModal) loginModal.hidden = true;
  if (accountMenu) accountMenu.hidden = true;
  if (accountButton) accountButton.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('modal-open');
  document.body.classList.add('is-authenticated');

  const roleLabel = document.getElementById('workspaceRoleLabel');
  const workspaceTitle = document.getElementById('workspaceTitle');
  const playerName = document.getElementById('workspacePlayerName');
  const playerEmail = document.getElementById('workspacePlayerEmail');
  const centerName = document.getElementById(`${selectedRole}CenterName`);
  const centerEmail = document.getElementById(`${selectedRole}CenterEmail`);
  const profileRole = document.getElementById('profileRole');
  const profileName = document.getElementById('profileDisplayName');
  const profileEmail = document.getElementById('profileDisplayEmail');
  const profilePhoto = document.getElementById('profilePhoto');
  const menuName = document.getElementById('accountMenuName');
  const menuRole = document.getElementById('accountMenuRole');
  const menuAvatar = document.getElementById('accountMenuAvatar');
  const profileRoles = { player: '選手', staff: '工作人員', audience: '觀眾' };
  const profileSport = { player: 'DUPR 3.8 · 男子雙打', staff: '冬季盃 · 賽事管理', audience: '公開觀眾 · 賽況追蹤' };
  if (roleLabel) roleLabel.textContent = details.label;
  if (workspaceTitle) workspaceTitle.textContent = `早安，${accountName}`;
  if (playerName) playerName.textContent = accountName;
  if (playerEmail) playerEmail.textContent = email;
  if (centerName) centerName.textContent = accountName;
  if (centerEmail) centerEmail.textContent = email;
  if (profileRole) profileRole.textContent = profileRoles[selectedRole];
  if (profileName) profileName.textContent = accountName;
  if (profileEmail) profileEmail.textContent = email;
  if (profilePhoto) profilePhoto.src = avatar;
  if (menuName) menuName.textContent = accountName;
  if (menuRole) menuRole.textContent = profileRoles[selectedRole];
  if (menuAvatar) menuAvatar.src = avatar;
  document.getElementById('profileDetailName').textContent = accountName;
  document.getElementById('profileDetailEmail').textContent = email;
  document.getElementById('profileDetailRole').textContent = profileRoles[selectedRole];
  document.getElementById('profileDetailSport').textContent = profileSport[selectedRole];
  const firstTab = activeDashboard?.querySelector('[data-portal-tab]');
  if (firstTab?.dataset.portalTab) showPortalPanel(firstTab.dataset.portalTab);
  if (accountButton) {
    const content = document.createElement('span');
    content.className = 'account-button-content';
    const photo = document.createElement('img');
    photo.src = avatar;
    photo.alt = '';
    const name = document.createElement('span');
    name.textContent = accountName;
    const caret = document.createElement('span');
    caret.className = 'account-caret';
    caret.textContent = '▾';
    content.append(photo, name, caret);
    accountButton.replaceChildren(content);
    accountButton.classList.add('is-signed-in');
  }
  try {
    localStorage.setItem('bluecourt-account', JSON.stringify({ email, role: selectedRole, displayName: accountName, photo: avatar }));
  } catch {
    localStorage.setItem('bluecourt-account', JSON.stringify({ email, role: selectedRole, displayName: accountName }));
  }
}

function getSavedAccount() {
  const storedAccount = localStorage.getItem('bluecourt-account');
  if (!storedAccount) return null;
  try {
    return JSON.parse(storedAccount);
  } catch {
    localStorage.removeItem('bluecourt-account');
    return null;
  }
}

function openAccount() {
  if (getSavedAccount()) {
    const isOpen = accountMenu?.hidden === false;
    if (accountMenu) accountMenu.hidden = isOpen;
    accountButton?.setAttribute('aria-expanded', String(!isOpen));
    return;
  }
  if (loginView) loginView.hidden = false;
  if (loginForm) loginForm.hidden = false;
  if (loginModal) loginModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeAccount() {
  if (loginModal) loginModal.hidden = true;
  document.body.classList.remove('modal-open');
}

accountButton?.addEventListener('click', openAccount);
document.getElementById('openProfile')?.addEventListener('click', () => {
  const account = getSavedAccount();
  if (!account) return openAccount();
  setSignedIn(account.email, account.role ?? 'player', account.displayName);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
});

document.getElementById('backToDashboard')?.addEventListener('click', () => {
  const account = getSavedAccount();
  const dashboard = document.getElementById(`${account?.role ?? 'player'}Dashboard`);
  dashboards.forEach((item) => { item.hidden = item !== dashboard; });
  if (profilePage) profilePage.hidden = true;
  if (workspaceHeading) workspaceHeading.hidden = false;
});

brandHome?.addEventListener('click', () => {
  if (roleWorkspace) roleWorkspace.hidden = true;
  if (registrationPage) registrationPage.hidden = true;
  if (profilePage) profilePage.hidden = true;
  if (homePage) homePage.hidden = false;
  document.body.classList.remove('is-authenticated');
  if (accountMenu) accountMenu.hidden = true;
  accountButton?.setAttribute('aria-expanded', 'false');
});

document.getElementById('loginModalBrand')?.addEventListener('click', (event) => {
  event.preventDefault();
  closeAccount();
  if (homePage) homePage.hidden = false;
  if (roleWorkspace) roleWorkspace.hidden = true;
  if (registrationPage) registrationPage.hidden = true;
  document.body.classList.remove('is-authenticated');
  window.scrollTo({ top: 0, behavior: 'auto' });
});

document.getElementById('registrationBrandHome')?.addEventListener('click', (event) => {
  event.preventDefault();
  if (registrationPage) registrationPage.hidden = true;
  if (homePage) homePage.hidden = false;
  document.body.classList.remove('is-authenticated');
});

roleChoices.forEach((button) => {
  button.addEventListener('click', () => {
    selectedRole = button.dataset.loginRole ?? 'player';
    roleChoices.forEach((choice) => choice.classList.toggle('active', choice === button));
    const details = roleDetails[selectedRole];
    const description = document.getElementById('loginDescription');
    const submitButton = document.getElementById('submitLogin');
    if (description) description.textContent = details.description;
    if (submitButton) submitButton.textContent = `以${details.label}身分登入`;
    if (demoLogin) demoLogin.textContent = `進入${details.label}示範介面`;
  });
});

demoLogin?.addEventListener('click', () => {
  setSignedIn(roleDetails[selectedRole].demoEmail, selectedRole);
});
loginForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = new FormData(loginForm).get('email')?.toString() ?? roleDetails[selectedRole].demoEmail;
  setSignedIn(email, selectedRole);
});

document.getElementById('showRegister')?.addEventListener('click', () => {
  const roleSelect = document.getElementById('registrationRole');
  if (roleSelect) roleSelect.value = selectedRole;
  if (loginModal) loginModal.hidden = true;
  if (homePage) homePage.hidden = true;
  if (roleWorkspace) roleWorkspace.hidden = true;
  if (registrationPage) registrationPage.hidden = false;
  document.body.classList.remove('modal-open');
});

document.getElementById('registrationLogin')?.addEventListener('click', () => {
  if (registrationPage) registrationPage.hidden = true;
  if (homePage) homePage.hidden = false;
  openAccount();
});

registerForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const email = formData.get('email')?.toString() ?? roleDetails[selectedRole].demoEmail;
  const displayName = formData.get('displayName')?.toString().trim() ?? roleDetails[selectedRole].name;
  selectedRole = formData.get('role')?.toString() ?? selectedRole;
  setSignedIn(email, selectedRole, displayName);
});

portalTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.portalTab) showPortalPanel(tab.dataset.portalTab);
  });
});

document.querySelectorAll('[data-staff-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.staffTab) showPortalPanel(button.dataset.staffTab);
  });
});

document.querySelectorAll('[data-player-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.playerTab) showPortalPanel(button.dataset.playerTab);
  });
});

const staffRegistrationRows = document.querySelectorAll('[data-portal-panel="staff-registration"] .data-list > .data-row');
staffRegistrationRows.forEach((row, index) => {
  row.dataset.staffCategory = index === 2 ? 'singles' : 'doubles';
});

document.getElementById('staffGroupFilter')?.addEventListener('change', (event) => {
  const category = event.target.value;
  staffRegistrationRows.forEach((row) => {
    row.hidden = category !== 'all' && row.dataset.staffCategory !== category;
  });
});

document.querySelectorAll('.review-action').forEach((button) => {
  button.addEventListener('click', () => {
    const row = button.closest('.data-row');
    const status = row?.querySelector('.staff-review-status');
    const action = button.dataset.reviewAction ?? button.textContent.trim();
    if (action === 'approve' || action.includes('核准')) {
      if (status) {
        status.textContent = '已核准';
        status.classList.add('success');
      }
      button.textContent = '已核准';
      button.disabled = true;
      return;
    }
    if (action === 'request' || action.includes('補')) {
      if (status) status.textContent = '已通知待補';
      button.textContent = '已通知';
      button.disabled = true;
      return;
    }
    showActionModal({
      title: '選手資格資料',
      description: row?.innerText.replace(button.textContent, '').trim() ?? '檢視選手提交的資格資料。',
    });
  });
});

document.getElementById('staffCheckinSearch')?.addEventListener('input', (event) => {
  const query = event.target.value.trim().toLocaleLowerCase();
  document.querySelectorAll('#staffCheckinList .data-row').forEach((row) => {
    row.hidden = !row.innerText.toLocaleLowerCase().includes(query);
  });
});

document.querySelectorAll('[data-portal-panel="staff-checkin"] .data-list > .data-row').forEach((row, index) => {
  const button = row.querySelector('button');
  if (index < 2 && button) {
    button.addEventListener('click', () => {
      const scoreMatch = row.querySelector('strong')?.textContent.match(/\s(\d+)\s*:\s*(\d+)\s/);
      const leftScore = scoreMatch?.[1] ?? '0';
      const rightScore = scoreMatch?.[2] ?? '0';
      showActionModal({
        title: `計分 · ${row.firstElementChild.textContent}`,
        description: '輸入目前比分後儲存，更新此場次的比分顯示。',
        primaryLabel: '儲存比分',
        buildBody: (body) => {
          body.innerHTML += '<label>主隊比分<input id="scoreLeft" type="number" min="0" value="' + leftScore + '"></label><label>客隊比分<input id="scoreRight" type="number" min="0" value="' + rightScore + '"></label>';
        },
        onConfirm: () => {
          const nextLeft = document.getElementById('scoreLeft').value;
          const nextRight = document.getElementById('scoreRight').value;
          const score = row.querySelector('strong');
          if (score) score.textContent = score.textContent.replace(/\s\d+\s*:\s*\d+\s/, `　${nextLeft} : ${nextRight}　`);
          const state = row.querySelector('.state-label');
          if (state) state.textContent = '比分已更新';
          closeActionModal();
        },
      });
    });
  }
});

document.querySelector('[data-action="attendance"]')?.addEventListener('click', () => {
  const row = document.querySelector('[data-action="attendance"]')?.closest('.data-row');
  showActionModal({
    title: '報到名單',
    description: '勾選已到場的候補隊伍，確認後更新報到統計。',
    primaryLabel: '確認報到',
    buildBody: (body) => {
      ['黃家豪 / 吳柏翰', '周子翔 / 蔡承恩', '林子翔 / 張育誠', '王怡婷 / 李佳蓉', '陳柏宇 / 趙明哲', '張家豪 / 林俊傑'].forEach((name, index) => {
        const label = document.createElement('label');
        label.className = 'checkin-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = name;
        label.append(checkbox, document.createTextNode(`第 ${index + 1} 隊　${name}`));
        body.append(label);
      });
    },
    onConfirm: () => {
      const arrived = document.querySelectorAll('#actionModalBody input:checked').length;
      const count = row?.querySelector('.attendance-summary');
      const total = row?.querySelector('strong');
      if (count) count.textContent = `${6 - arrived} 隊未到`;
      if (total) total.textContent = `${36 + arrived} 隊已報到`;
      closeActionModal();
    },
  });
});

document.querySelectorAll('[data-action="team-details"]').forEach((button) => {
  button.addEventListener('click', () => showActionModal({
    title: '冬季盃雙打隊伍',
    description: '隊長：王立晨。隊友：林俊宏（已確認）。資格審核已通過，隊伍報名成立。',
  }));
});

document.querySelectorAll('[data-action="score-history"]').forEach((button) => {
  button.addEventListener('click', () => showActionModal({
    title: '比分修正紀錄',
    description: '場次 #08：裁判於 14:12 將 9 : 8 修正為 10 : 8。修正者：裁判 02。',
  }));
});

document.getElementById('actionModalPrimary')?.addEventListener('click', () => actionConfirmHandler?.());
document.querySelectorAll('[data-action-close]').forEach((button) => button.addEventListener('click', closeActionModal));
document.getElementById('actionModal')?.addEventListener('click', (event) => {
  if (event.target.id === 'actionModal') closeActionModal();
});

const scheduleRows = document.querySelectorAll('.audience-schedule-row');
const scheduleDates = ['2026-11-21', '2026-11-22', '2026-11-23'];
scheduleRows.forEach((row, index) => { row.dataset.scheduleDate = scheduleDates[index]; });
document.getElementById('audienceScheduleDate')?.addEventListener('change', (event) => {
  scheduleRows.forEach((row) => { row.hidden = row.dataset.scheduleDate !== event.target.value; });
});
const audienceScheduleDate = document.getElementById('audienceScheduleDate');
if (audienceScheduleDate) audienceScheduleDate.dispatchEvent(new Event('change'));

document.querySelectorAll('.audience-filters .filter-chip').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.audience-filters .filter-chip').forEach((item) => item.classList.toggle('active', item === button));
    const category = button.dataset.audienceGroup ?? 'all';
    document.querySelectorAll('.audience-match').forEach((match) => {
      match.hidden = category !== 'all' && match.dataset.audienceCategory !== category;
    });
  });
});

document.getElementById('menuSignOut')?.addEventListener('click', () => {
  localStorage.removeItem('bluecourt-account');
  if (accountButton) {
    accountButton.textContent = '登入';
    accountButton.classList.remove('is-signed-in');
    accountButton.setAttribute('aria-expanded', 'false');
  }
  if (accountMenu) accountMenu.hidden = true;
  if (roleWorkspace) roleWorkspace.hidden = true;
  if (registrationPage) registrationPage.hidden = true;
  if (homePage) homePage.hidden = false;
  document.body.classList.remove('is-authenticated');
  document.body.classList.remove('modal-open');
});

document.getElementById('profilePhotoInput')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file || !file.type.startsWith('image/') || file.size > 1024 * 1024) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const photo = reader.result?.toString();
    const account = getSavedAccount();
    if (!photo || !account) return;
    account.photo = photo;
    localStorage.setItem('bluecourt-account', JSON.stringify(account));
    document.getElementById('profilePhoto').src = photo;
    document.getElementById('accountMenuAvatar').src = photo;
    const buttonPhoto = accountButton?.querySelector('img');
    if (buttonPhoto) buttonPhoto.src = photo;
  });
  reader.readAsDataURL(file);
});

document.addEventListener('click', (event) => {
  if (!accountMenu?.hidden && !event.target.closest('.account-area')) {
    accountMenu.hidden = true;
    accountButton?.setAttribute('aria-expanded', 'false');
  }
});

document.querySelectorAll('[data-close-modal]').forEach((element) => {
  element.addEventListener('click', closeAccount);
});
loginModal?.addEventListener('click', (event) => {
  if (event.target === loginModal) closeAccount();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && loginModal && !loginModal.hidden) closeAccount();
  if (event.key === 'Escape' && !document.getElementById('actionModal').hidden) closeActionModal();
  if (event.key === 'Escape' && accountMenu && !accountMenu.hidden) {
    accountMenu.hidden = true;
    accountButton?.setAttribute('aria-expanded', 'false');
  }
});

const existingAccount = getSavedAccount();
if (existingAccount) setSignedIn(existingAccount.email, existingAccount.role ?? 'player');

document.getElementById('staffEventForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const newEvent = {
    id: `${Date.now()}`,
    name: formData.get('name').toString().trim(),
    date: formData.get('date').toString(),
    location: formData.get('location').toString().trim(),
    courts: Number(formData.get('courts')),
    capacity: Number(formData.get('capacity')),
    groups: formData.get('groups').toString().split(/[、,，]/).map((group) => group.trim()).filter(Boolean),
    deadline: formData.get('deadline').toString(),
  };
  const events = readLocalList('bluecourt-managed-events');
  events.unshift(newEvent);
  localStorage.setItem('bluecourt-managed-events', JSON.stringify(events));
  renderCreatedEvents();
  const message = document.getElementById('eventSavedStatus') ?? document.createElement('p');
  message.id = 'eventSavedStatus';
  message.className = 'status-callout';
  message.textContent = `「${newEvent.name}」已儲存在此瀏覽器。`;
  event.currentTarget.append(message);
  event.currentTarget.reset();
});

document.getElementById('staffScheduleForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const teams = formData.get('teams').toString().split(/\r?\n/).map((team) => team.trim()).filter(Boolean);
  const status = document.getElementById('scheduleGeneratedStatus') ?? document.createElement('p');
  status.id = 'scheduleGeneratedStatus';
  status.className = 'status-callout';
  event.currentTarget.append(status);
  if (teams.length < 2 || teams.length % 2 !== 0) {
    status.textContent = '請輸入偶數支隊伍，系統才能兩兩配對。';
    status.style.color = 'var(--danger)';
    return;
  }

  const courts = Number(formData.get('courts'));
  const interval = Number(formData.get('interval'));
  const firstTime = new Date(`${formData.get('date')}T${formData.get('time')}:00`);
  const eventName = formData.get('event').toString();
  const group = formData.get('group').toString();
  const matches = [];
  for (let index = 0; index < teams.length; index += 2) {
    const start = new Date(firstTime.getTime() + (index / 2) * interval * 60000);
    matches.push({
      id: `${Date.now()}-${index}`,
      event: eventName,
      group,
      date: formData.get('date').toString(),
      time: start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }),
      court: (index / 2) % courts + 1,
      teamA: teams[index],
      teamB: teams[index + 1],
    });
  }
  const schedule = [...matches, ...readLocalList('bluecourt-managed-schedule')];
  localStorage.setItem('bluecourt-managed-schedule', JSON.stringify(schedule));
  renderGeneratedSchedule();
  status.style.color = '';
  status.textContent = `已依隊伍順序產生 ${matches.length} 場配對並儲存在此瀏覽器。`;
});

document.getElementById('createdEventList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-event]');
  if (!button) return;
  const eventId = button.dataset.removeEvent;
  const events = readLocalList('bluecourt-managed-events').filter((item) => item.id !== eventId);
  localStorage.setItem('bluecourt-managed-events', JSON.stringify(events));
  renderCreatedEvents();
});

document.getElementById('generatedScheduleList')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-match]');
  if (!button) return;
  const matches = readLocalList('bluecourt-managed-schedule').filter((item) => item.id !== button.dataset.removeMatch);
  localStorage.setItem('bluecourt-managed-schedule', JSON.stringify(matches));
  renderGeneratedSchedule();
});

renderCreatedEvents();
renderGeneratedSchedule();

document.querySelector('#staffScheduleForm select[name="event"]')?.addEventListener('change', (event) => {
  const option = event.target.selectedOptions[0];
  const date = document.querySelector('#staffScheduleForm input[name="date"]');
  const courts = document.querySelector('#staffScheduleForm input[name="courts"]');
  if (date && option.dataset.date) date.value = option.dataset.date;
  if (courts && option.dataset.courts) courts.value = option.dataset.courts;
});

updateEvents();
