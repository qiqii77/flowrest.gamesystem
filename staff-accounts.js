'use strict';
let staffBatchResult = [],
  staffExportRows = [],
  staffCredentialOwner = '',
  staffDraftOwner = '';
let staffBatchBusy = false,
  staffMode = 'quick',
  staffRevealPasswords = false,
  staffBatchError = '';
let staffQuickDraft = { role: 'referee', eventId: '', count: 5, prefix: '' };
let staffManualDrafts = [{ name: '', email: '', password: '', role: 'manager', eventId: '' }];
let staffAssignmentEvent = '',
  staffAssignmentExpanded = false;
let staffRefereePrefill = null;
function syncStaffCredentialOwner() {
  if (staffDraftOwner && app.current()?.id !== staffDraftOwner) {
    document.querySelector('.staff-batch-result')?.remove();
    document.querySelectorAll('[data-staff-row] input[name=password]').forEach((input) => {
      input.value = '';
      input.removeAttribute('value');
    });
    staffBatchResult = [];
    staffExportRows = [];
    staffCredentialOwner = '';
    staffDraftOwner = '';
    staffManualDrafts = [{ name: '', email: '', password: '', role: 'manager', eventId: '' }];
    staffQuickDraft = { role: 'referee', eventId: '', count: 5, prefix: '' };
    staffBatchError = '';
    staffRevealPasswords = false;
    staffRefereePrefill = null;
  }
}
function staffAccountRow(data = {}) {
  return `<fieldset class="staff-account-row" data-staff-row><legend>帳號 <span data-row-number></span></legend>
 <div class="staff-row-heading"><span class="muted-copy">登入 Email 不可重複</span><button type="button" class="text-button" data-staff-action="remove" aria-label="刪除此列">${icon('trash-2')} 刪除此列</button></div>
 <div class="form-grid">
 ${field('姓名 *', 'name', data.name || '', 'text', 'required maxlength="100" autocomplete="off"')}
 ${field('登入 Email *', 'email', data.email || '', 'email', 'required maxlength="254" autocomplete="off"')}
 ${field('初始密碼 *', 'password', data.password || '', 'password', 'required minlength="8" maxlength="128" autocomplete="new-password"')}
 <label class="form-field">帳號功能 *<select name="role" required>${options(
   [
     ['manager', '賽事管理員'],
     ['referee', '裁判'],
   ],
   data.role || 'manager',
 )}</select></label>
 <label class="form-field">所屬賽事 *<select name="eventId" required>${options([['', '請選擇賽事'], ...app.managedEvents().map((e) => [e.id, e.name])], data.eventId || '')}</select></label>
 </div></fieldset>`;
}
function captureStaffDraft(form) {
  if (!form) return;
  if (form.dataset.form === 'staff-quick') staffQuickDraft = Object.fromEntries(new FormData(form));
  if (form.dataset.form === 'staff-batch')
    staffManualDrafts = [...form.querySelectorAll('[data-staff-row]')].map((row) =>
      Object.fromEntries(
        [...row.querySelectorAll('[name]')].map((input) => [input.name, input.value]),
      ),
    );
}
function numberStaffRows(form) {
  const rows = [...form.querySelectorAll('[data-staff-row]')];
  rows.forEach((row, i) => {
    row.querySelector('[data-row-number]').textContent = i + 1;
    row.querySelector('[data-staff-action=remove]').disabled = staffBatchBusy || rows.length === 1;
  });
  form.querySelector('[data-staff-action=add]').disabled = staffBatchBusy || rows.length >= 50;
  form.querySelector('[data-batch-count]').textContent =
    '共 ' + rows.length + ' 個帳號 / 每批最多 50 個';
}
function staffQuickView() {
  const d = staffQuickDraft;
  return `<form class="workflow-form staff-quick-form" data-form="staff-quick"><fieldset class="staff-form-fields" ${staffBatchBusy ? 'disabled' : ''}>
 <h3>選好角色與賽事，輸入數量即可開立</h3><div class="staff-quick-fields">
 <label class="form-field">帳號功能 *<select name="role" required>${options(
   [
     ['referee', '裁判'],
     ['manager', '賽事管理員'],
   ],
   d.role,
 )}</select></label>
 <label class="form-field">所屬賽事 *<select name="eventId" required>${options([['', '請選擇賽事'], ...app.managedEvents().map((e) => [e.id, e.name])], d.eventId)}</select></label>
 ${field('開立數量 *', 'count', d.count, 'number', 'required min="1" max="50" step="1"')}
 </div><details class="staff-prefix-settings"><summary>自訂帳號前綴（選填）</summary>
 ${field('帳號前綴', 'prefix', d.prefix, 'text', 'maxlength="24" pattern="[a-zA-Z][a-zA-Z0-9_-]{1,23}" placeholder="例如：taipei-referee"')}
 <p class="muted-copy">未填時依角色產生 referee001 或 manager001 等登入帳號；已使用的編號會自動跳過。</p></details>
 <p class="staff-quick-summary" data-quick-summary role="status"></p>
 <button class="primary-button staff-create-button" type="submit">${icon('plus')} ${staffBatchBusy ? '正在開立帳號…' : '一鍵建立帳號'}</button>
 <p class="form-error" data-batch-error role="alert">${h(staffBatchError)}</p>
 <p class="muted-copy">系統會產生登入 Email 與隨機初始密碼。裁判場次稍後至「賽事更動」指派。</p>
 </fieldset></form>`;
}
function staffManualView() {
  return `<form class="workflow-form staff-batch-form" data-form="staff-batch"><fieldset class="staff-form-fields" ${staffBatchBusy ? 'disabled' : ''}>
 <div data-staff-rows>${staffManualDrafts.map(staffAccountRow).join('')}</div>
 <div class="staff-batch-actions"><button class="secondary-button" type="button" data-staff-action="add">${icon('plus')} 新增一列</button><span data-batch-count role="status"></span>
 <button class="primary-button" type="submit">${icon('user-round')} 建立全部帳號</button></div>
 <p class="form-error" data-batch-error role="alert">${h(staffBatchError)}</p>
 <p class="muted-copy">初始密碼至少 8 個字元。任一列有錯誤時整批不建立；裁判場次於建立後再指派。</p>
 </fieldset></form>`;
}
function staffCredentialsCsv(rows) {
  const lines = [['登入帳號', '初始密碼', '姓名', '帳號功能', '所屬賽事', '裁判場次']];
  for (const row of rows)
    lines.push([
      row.email,
      row.initialPassword,
      row.name,
      BlueCourt.labels[row.role],
      row.eventName,
      row.role === 'referee' ? '待後續指派' : '不適用',
    ]);
  return (
    '\uFEFF' +
    lines
      .map((line) =>
        line.map((value) => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(','),
      )
      .join('\r\n') +
    '\r\n'
  );
}
function staffResultsView() {
  if (!staffBatchResult.length) return '';
  const canExport = app.current()?.id === staffCredentialOwner && staffExportRows.length > 0;
  return `<section class="staff-batch-result" aria-live="polite"><div class="staff-result-heading"><div><h3>已建立 ${staffBatchResult.length} 個帳號</h3><p>帳號功能與所屬賽事已設定，裁判可待排程後再指派場次。</p></div>
 <button type="button" class="primary-button" data-staff-action="export" ${!canExport ? 'disabled' : ''}>${icon('arrow-down')} 匯出帳號密碼 CSV</button></div>
 <p class="staff-export-note">初始密碼僅保留於這次操作，重新整理或登出後即清除，請先匯出保存。</p>
 <div class="staff-result-controls"><button type="button" class="text-button" data-staff-action="reveal" ${!canExport ? 'disabled' : ''}>${icon('lock-keyhole')} ${staffRevealPasswords ? '隱藏密碼' : '顯示密碼'}</button>
 <button type="button" class="text-button" data-staff-action="clear">清除本批匯出資料</button></div>
 <div class="staff-result-list">${staffBatchResult
   .map(
     (row, i) => `<article><strong>${h(row.name)}</strong><code>${h(row.email)}</code>
 <span>初始密碼：<code data-initial-password>${staffRevealPasswords ? h(staffExportRows[i]?.initialPassword || '') : '••••••••••••'}</code></span>
 <span>${h(BlueCourt.labels[row.role])} · ${h(row.eventName)}</span>
 ${row.role === 'referee' ? `<button type="button" class="text-button" data-staff-action="assign" data-event="${h(row.eventId)}" data-email="${h(row.email)}">${icon('arrow-right')} 前往賽事更動指派場次</button>` : '<small>已取得此賽事管理介面</small>'}</article>`,
   )
   .join('')}</div></section>`;
}
function eventRefereePool(e) {
  return (e.referees || [])
    .map((uid) => app.db.users.find((u) => u.id === uid))
    .filter(Boolean)
    .map((user) => {
      const count = app.db.matches.filter(
        (m) => m.eventId === e.id && m.refereeId === user.id,
      ).length;
      return `<article class="competition-card staff-pool-card"><div><strong>${h(user.name)} · 裁判</strong><p>${h(user.email)}</p><p>${count ? '已指派 ' + count + ' 場' : '待指派場次'}</p></div>
  <div class="inline-actions"><button type="button" class="text-button" data-staff-action="assign" data-event="${h(e.id)}" data-email="${h(user.email)}">前往場次指派</button>
  <button type="button" class="text-button" data-staff-action="revoke" data-event="${h(e.id)}" data-user="${h(user.id)}" ${count ? 'disabled title="請先解除場次指派"' : ''}>移除待指派資格</button></div></article>`;
    })
    .join('');
}
function staffExistingAssignmentsView() {
  const events = app.managedEvents();
  if (!events.some((e) => e.id === staffAssignmentEvent))
    staffAssignmentEvent = events.some((e) => e.id === activeEvent) ? activeEvent : events[0].id;
  const e = app.event(staffAssignmentEvent);
  return `<details class="staff-existing-assignment" data-staff-assignment-panel ${staffAssignmentExpanded ? 'open' : ''}><summary>既有工作人員的權限與場次指派</summary>
 <form class="workflow-form" data-form="manager" data-event="${h(e.id)}"><h3>指派既有帳號為賽事管理員</h3>
 <label class="form-field">所屬賽事<select name="eventId" data-staff-manager-event>${options(
   events.map((e) => [e.id, e.name]),
   e.id,
 )}</select></label>
 ${registeredAccountSearch(
   app.db.users.filter((u) => u.canLogin !== false && !u.admin),
   '',
   false,
   true,
 )}
 <label class="form-field">操作<select name="operation"><option value="add">指派賽事管理員</option><option value="remove">移除賽事管理員</option></select></label><button class="primary-button">儲存權限</button></form>
 <h3>此賽事的裁判帳號</h3>${eventRefereePool(e) || empty('尚無批次建立的裁判帳號。可先開立帳號，再到賽事更動指派場次。')}</details>`;
}
function staffAccountsView() {
  syncStaffCredentialOwner();
  if (app.role() !== 'admin') return empty('只有系統管理員可以批次開立帳號。');
  staffDraftOwner = app.current().id;
  if (!app.db.events.length) return heading('批次開立帳號') + empty('請先至賽事登錄建立賽事。');
  return (
    heading('批次開立帳號', '快速建立工作人員') +
    '<p class="staff-demo-note">目前為示範環境，建立的帳號僅在此瀏覽器有效。</p>' +
    `<div class="staff-mode-tabs" role="group" aria-label="帳號開立方式"><button type="button" class="secondary-button ${staffMode === 'quick' ? 'active' : ''}" data-staff-action="mode" data-mode="quick" aria-pressed="${staffMode === 'quick'}" ${staffBatchBusy ? 'disabled' : ''}>${icon('plus')} 一鍵快速開立</button>
 <button type="button" class="secondary-button ${staffMode === 'manual' ? 'active' : ''}" data-staff-action="mode" data-mode="manual" aria-pressed="${staffMode === 'manual'}" ${staffBatchBusy ? 'disabled' : ''}>${icon('copy')} 逐列自訂帳號</button></div>` +
    (staffMode === 'quick' ? staffQuickView() : staffManualView()) +
    staffResultsView() +
    staffExistingAssignmentsView()
  );
}
function updateStaffQuickSummary(form) {
  if (!form) return;
  const d = Object.fromEntries(new FormData(form)),
    e = app.db.events.find((e) => e.id === d.eventId);
  form.querySelector('[data-quick-summary]').textContent = e
    ? '將為「' + e.name + '」建立 ' + (d.count || 0) + ' 個' + BlueCourt.labels[d.role] + '帳號'
    : '選擇所屬賽事後即可開立帳號。';
}
function exportStaffCredentials() {
  app.load();
  app.requireAdmin();
  if (app.current().id !== staffCredentialOwner || !staffExportRows.length)
    throw new Error('目前沒有可匯出的本批帳號密碼。');
  const content = staffCredentialsCsv(staffExportRows);
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(/\D/g, '');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bluecourt-staff-' + stamp + '.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('已準備下載本批帳號密碼 CSV。');
}
document.addEventListener('input', (event) => {
  const form = event.target.closest('[data-form=staff-quick],[data-form=staff-batch]');
  if (form) {
    captureStaffDraft(form);
    if (form.dataset.form === 'staff-quick') updateStaffQuickSummary(form);
  }
});
document.addEventListener('change', (event) => {
  const form = event.target.closest('[data-form=staff-quick],[data-form=staff-batch]');
  if (form) {
    captureStaffDraft(form);
    if (form.dataset.form === 'staff-quick') updateStaffQuickSummary(form);
  }
  if (event.target.matches('[data-staff-manager-event]')) {
    captureStaffDraft(document.querySelector('[data-form=staff-quick],[data-form=staff-batch]'));
    staffAssignmentEvent = event.target.value;
    renderWorkspace();
  }
});
document.addEventListener(
  'toggle',
  (event) => {
    if (event.target.matches?.('[data-staff-assignment-panel]') && event.target.isConnected)
      staffAssignmentExpanded = event.target.open;
  },
  true,
);
document.addEventListener('click', (event) => {
  const b = event.target.closest('[data-staff-action]');
  if (!b || b.disabled) return;
  try {
    app.requireAdmin();
    const action = b.dataset.staffAction;
    if (action === 'export') {
      exportStaffCredentials();
      return;
    }
    if (staffBatchBusy) return;
    if (action === 'assign') {
      staffRefereePrefill = {
        owner: app.current().id,
        eventId: b.dataset.event,
        email: b.dataset.email,
      };
      activeEvent = b.dataset.event;
      activeTab = 'events';
      activeSubtab = 'changes';
      setView('workspace');
      renderWorkspace();
      notice('請選擇場次，展開「裁判指派」並儲存。');
      return;
    }
    if (action === 'revoke') {
      app.revokeEventReferee(b.dataset.event, b.dataset.user);
      renderWorkspace();
      notice('已移除待指派裁判資格。');
      return;
    }
    if (action === 'clear') {
      staffBatchResult = [];
      staffExportRows = [];
      staffCredentialOwner = '';
      staffRevealPasswords = false;
      renderWorkspace();
      return;
    }
    if (action === 'reveal') {
      staffRevealPasswords = !staffRevealPasswords;
      renderWorkspace();
      return;
    }
    if (action === 'mode') {
      captureStaffDraft(document.querySelector('[data-form=staff-quick],[data-form=staff-batch]'));
      staffMode = b.dataset.mode;
      staffBatchError = '';
      renderWorkspace();
      return;
    }
    const form = b.closest('[data-form=staff-batch]');
    if (!form) return;
    if (action === 'add' && form.querySelectorAll('[data-staff-row]').length < 50)
      form.querySelector('[data-staff-rows]').insertAdjacentHTML('beforeend', staffAccountRow());
    if (action === 'remove' && form.querySelectorAll('[data-staff-row]').length > 1)
      b.closest('[data-staff-row]').remove();
    captureStaffDraft(form);
    numberStaffRows(form);
  } catch (error) {
    handleError(error);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['staff-quick', 'staff-batch'].includes(form.dataset.form)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (staffBatchBusy) return;
  captureStaffDraft(form);
  staffBatchError = '';
  const owner = app.current()?.id,
    quick = form.dataset.form === 'staff-quick';
  const rows = quick ? null : staffManualDrafts.map((row) => ({ ...row, matchId: '' }));
  const data = quick ? Object.fromEntries(new FormData(form)) : null;
  staffBatchBusy = true;
  const controls = [...form.querySelectorAll('input,select,button')].map((el) => [el, el.disabled]);
  controls.forEach(([el]) => (el.disabled = true));
  form.setAttribute('aria-busy', 'true');
  let success = false;
  try {
    const result = quick
      ? await app.createQuickStaffAccounts(data)
      : await app.createStaffAccounts(rows);
    if (app.current()?.id !== owner) throw new Error('操作帳號已變更，請重新登入。');
    staffBatchResult = result.map(({ initialPassword, ...account }) => account);
    staffExportRows = result.map((account, i) => ({
      ...account,
      initialPassword: quick ? account.initialPassword : rows[i].password,
    }));
    staffCredentialOwner = owner;
    staffDraftOwner = owner;
    staffRevealPasswords = false;
    staffAssignmentEvent = result[0].eventId;
    staffManualDrafts = [{ name: '', email: '', password: '', role: 'manager', eventId: '' }];
    success = true;
  } catch (error) {
    staffBatchError = error.message;
  } finally {
    staffBatchBusy = false;
    controls.forEach(([el, disabled]) => {
      if (el.isConnected) el.disabled = disabled;
    });
    form.removeAttribute('aria-busy');
    if (view === 'workspace' && activeTab === 'staff') renderWorkspace();
    if (success) notice('已建立 ' + staffBatchResult.length + ' 個帳號，可立即匯出帳號密碼。');
    else if (view !== 'workspace' || activeTab !== 'staff') handleError(new Error(staffBatchError));
  }
});
