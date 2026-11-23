'use strict';
function eventGroupLimit(e, name) {
  return e.groupLimits?.[name] || Math.max(1, Math.ceil(e.capacity / e.groups.length));
}
function groupDefinitionRow(item = { name: '', capacity: 16 }, locked = false) {
  return `<div class="group-definition-row" data-group-definition>
 ${field('比賽項目 *', 'groupName', item.name, 'text', 'required maxlength="80" ' + (locked ? 'readonly' : ''))}
 ${field('本項目組數上限（組）*', 'groupCapacity', item.capacity, 'number', 'required min="1" max="256" step="1"')}
 <button type="button" class="text-button" data-group-action="remove" aria-label="移除此比賽項目" ${locked ? 'disabled data-group-locked' : ''}>${icon('trash-2')} 移除</button></div>`;
}
function eventGroupsEditor(definitions, event = null) {
  const used = event
    ? new Set([
        ...app.db.entries.filter((r) => r.eventId === event.id).map((r) => r.group),
        ...app.db.matches.filter((m) => m.eventId === event.id).map((m) => m.group),
      ])
    : new Set();
  return `<section class="event-groups-editor" data-group-editor><h3>比賽項目與報名組數上限</h3>
 <p class="muted-copy">每個項目分別設定可報名的組數；單打每位選手算一組，雙打或團體則以隊伍為一組。</p>
 <div data-group-definitions>${definitions.map((item) => groupDefinitionRow(item, used.has(item.name))).join('')}</div>
 <div class="inline-actions"><button type="button" class="secondary-button" data-group-action="add">${icon('plus')} 新增比賽項目</button><span data-group-total role="status"></span></div></section>`;
}
function readGroupDefinitions(form) {
  return [...form.querySelectorAll('[data-group-definition]')].map((row) => ({
    name: row.querySelector('[name=groupName]').value.trim(),
    capacity: Number(row.querySelector('[name=groupCapacity]').value),
  }));
}
function refreshGroupDefinitions(editor) {
  if (!editor) return;
  const rows = [...editor.querySelectorAll('[data-group-definition]')];
  rows.forEach(
    (row) =>
      (row.querySelector('[data-group-action=remove]').disabled =
        rows.length === 1 ||
        row.querySelector('[data-group-action=remove]').hasAttribute('data-group-locked')),
  );
  editor.querySelector('[data-group-action=add]').disabled = rows.length >= 30;
  const total = rows.reduce(
    (sum, row) => sum + (Number(row.querySelector('[name=groupCapacity]').value) || 0),
    0,
  );
  editor.querySelector('[data-group-total]').textContent =
    '共 ' + rows.length + ' 個項目 · 合計 ' + total + ' 組';
}
function enrollmentGroupState(e, u, group) {
  const limit = eventGroupLimit(e, group),
    used = app.db.entries.filter(
      (r) => r.eventId === e.id && r.group === group && r.status !== 'rejected',
    ).length;
  const registered = app.db.entries.some(
    (r) => r.eventId === e.id && r.userId === u.id && r.group === group,
  );
  return {
    limit,
    remaining: Math.max(0, limit - used),
    registered,
    available: !registered && used < limit,
  };
}
function enrollmentAvailableGroups(e, u = app.current()) {
  return e.groups.filter((group) => enrollmentGroupState(e, u, group).available);
}
function refreshScheduleBadges() {
  document.querySelectorAll('[data-match-id]').forEach((card) => {
    const m = app.db.matches.find((m) => m.id === card.dataset.matchId);
    if (!m) return;
    card.classList.toggle('match-finished', m.status === 'finished');
    const badge = card.querySelector('[data-match-state]');
    if (badge) badge.outerHTML = statusBadge(m);
    const status = card.querySelector('[data-form=match] [name=status]');
    if (status && m.autoDelayed && status.value === 'pending' && document.activeElement !== status)
      status.value = 'delayed';
  });
  if(typeof refreshRefereeStatusList==='function')refreshRefereeStatusList();
}
document.addEventListener('click', (event) => {
  const b = event.target.closest('[data-group-action]');
  if (!b || b.disabled) return;
  const editor = b.closest('[data-group-editor]');
  if (
    b.dataset.groupAction === 'add' &&
    editor.querySelectorAll('[data-group-definition]').length < 30
  )
    editor
      .querySelector('[data-group-definitions]')
      .insertAdjacentHTML('beforeend', groupDefinitionRow());
  else if (b.dataset.groupAction === 'remove') b.closest('[data-group-definition]').remove();
  refreshGroupDefinitions(editor);
});
document.addEventListener('input', (event) => {
  const editor = event.target.closest('[data-group-editor]');
  if (editor) refreshGroupDefinitions(editor);
});
