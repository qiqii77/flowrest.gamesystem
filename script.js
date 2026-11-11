const menuToggle = document.getElementById('menuToggle');
const navDropdown = document.getElementById('navDropdown');
const navLinks = document.querySelectorAll('.nav-link');
const eventGrid = document.getElementById('eventGrid');
const eventSort = document.getElementById('eventSort');
const eventSearch = document.getElementById('eventSearch');
const filterButtons = document.querySelectorAll('.filter-chip');
const resultsCount = document.getElementById('resultsCount');
const emptyResults = document.getElementById('emptyResults');
const accountButton = document.getElementById('accountButton');
const loginModal = document.getElementById('loginModal');
const loginView = document.getElementById('loginView');
const profileView = document.getElementById('profileView');
const loginForm = document.getElementById('loginForm');
const demoLogin = document.getElementById('demoLogin');
const signOut = document.getElementById('signOut');
let activeFilter = 'all';

if (menuToggle && navDropdown) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navDropdown.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    navDropdown.setAttribute('aria-hidden', String(!isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.forEach((item) => item.classList.toggle('active', item === link));
    if (window.innerWidth <= 980 && navDropdown) {
      navDropdown.classList.remove('open');
      menuToggle?.setAttribute('aria-expanded', 'false');
      navDropdown.setAttribute('aria-hidden', 'true');
    }
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

function setSignedIn(email = 'player@bluecourt.tw') {
  const displayName = email.split('@')[0] === 'player' ? '王立晨' : email.split('@')[0];
  if (profileView) profileView.hidden = false;
  if (loginView) loginView.hidden = true;
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = email;
  if (accountButton) accountButton.textContent = displayName;
  localStorage.setItem('bluecourt-account', JSON.stringify({ email, displayName }));
}

function openAccount() {
  const account = localStorage.getItem('bluecourt-account');
  if (account) {
    try {
      setSignedIn(JSON.parse(account).email);
    } catch {
      localStorage.removeItem('bluecourt-account');
      if (profileView) profileView.hidden = true;
      if (loginView) loginView.hidden = false;
    }
  } else {
    if (profileView) profileView.hidden = true;
    if (loginView) loginView.hidden = false;
  }
  if (loginModal) loginModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeAccount() {
  if (loginModal) loginModal.hidden = true;
  document.body.classList.remove('modal-open');
}

accountButton?.addEventListener('click', openAccount);
demoLogin?.addEventListener('click', () => setSignedIn('player@bluecourt.tw'));
loginForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const email = new FormData(loginForm).get('email')?.toString() ?? 'player@bluecourt.tw';
  setSignedIn(email);
});
signOut?.addEventListener('click', () => {
  localStorage.removeItem('bluecourt-account');
  if (accountButton) accountButton.textContent = '登入';
  if (profileView) profileView.hidden = true;
  if (loginView) loginView.hidden = false;
});

document.querySelectorAll('[data-close-modal]').forEach((element) => {
  element.addEventListener('click', closeAccount);
});
loginModal?.addEventListener('click', (event) => {
  if (event.target === loginModal) closeAccount();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && loginModal && !loginModal.hidden) closeAccount();
});

updateEvents();
