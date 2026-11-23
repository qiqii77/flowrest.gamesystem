'use strict';
function participantRoster(e) {
  if (!app.canManage(e.id)) return empty('你沒有這場賽事的選手名單權限。');
  const entries = app.db.entries.filter((r) => r.eventId === e.id);
  const statusNames = { pending: '審核中', approved: '報名成功', rejected: '未通過' };
  const rows =
    entries
      .map((r) => {
        const user = app.db.users.find((u) => u.id === r.userId) || {};
        const contact = r.contact || user,
          name = contact.name || user.name || r.team;
        const email = user.email || contact.email || '',
          phone = contact.phone || user.phone || '';
        return searchableItem(
          r.id,
          [
            name,
            r.team,
            r.group,
            email,
            phone,
            statusNames[r.status],
            ...Object.values(contact),
            ...(r.answers || []).map((a) => a.value),
          ],
          `<article class="competition-card participant-card" data-participant-entry="${h(r.id)}">
      <div class="participant-identity"><span class="participant-avatar">${h(name.slice(0, 2))}</span><div><strong>${h(name)}</strong><p>${h(r.team)}</p></div></div>
      <dl class="participant-facts"><div><dt>報名項目</dt><dd>${h(r.group)}</dd></div><div><dt>聯絡電話</dt><dd>${h(phone || '未提供')}</dd></div><div><dt>電子郵件</dt><dd>${h(email || '未提供')}</dd></div></dl>
      <div class="participant-actions"><span class="entry-status status-${h(r.status)}">${h(statusNames[r.status] || r.status)}</span><button type="button" class="secondary-button" data-roster-entry="${h(r.id)}">查看報名資料</button></div></article>`,
        );
      })
      .join('') || empty('目前還沒有選手報名這場賽事。');
  return (
    heading('選手名單', e.name) +
    `<div class="roster-summary">
    <div><strong>${new Set(entries.map((r) => r.userId)).size}</strong><span>報名選手</span></div>
    <div><strong>${entries.length}</strong><span>項目報名筆數</span></div>
    <div><strong>${entries.filter((r) => r.status === 'approved').length}</strong><span>報名成功</span></div>
    <div><strong>${entries.filter((r) => r.status === 'pending').length}</strong><span>審核中</span></div></div>` +
    workspaceSearchPanel('roster', e, '搜尋選手姓名、隊伍、Email、電話、組別、狀態或報名資料', rows)
  );
}
document.addEventListener('click', (ev) => {
  const target = ev.target.closest('[data-roster-entry]');
  if (!target) return;
  try {
    const data = app.registrationDetails(target.dataset.rosterEntry);
    modal({
      title: '選手報名資料 · ' + data.entry.team,
      description: data.event.name,
      body: registrationDetailBody(data, true),
    });
  } catch (error) {
    notice(error.message);
  }
});
