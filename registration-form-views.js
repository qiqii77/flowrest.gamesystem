/* Applicant fields and historical answers. */
function registrationInput(f, u) {
  const value = f.id === 'team' ? u.name : (u[f.id] ?? ''),
    required = f.required ? 'required' : '',
    label = f.label + (f.required ? ' *' : '');
  if (f.type === 'checkbox')
    return `<label class="applicant-checkbox"><input type="checkbox" name="${h(f.id)}" ${required}>${h(label)}</label>`;
  if (f.type === 'textarea')
    return `<label class="form-field">${h(label)}<textarea name="${h(f.id)}" rows="3" maxlength="5000" ${required}></textarea></label>`;
  if (f.type === 'select')
    return `<label class="form-field">${h(label)}<select name="${h(f.id)}" ${required}>${options([['', '請選擇'], ...f.options.map((v) => [v, v])], value)}</select></label>`;
  return field(
    label,
    f.id,
    value,
    f.type,
    required + (f.type === 'number' ? ' step="any"' : f.type === 'date' ? '' : ' maxlength="2000"'),
  );
}
function enrollmentFields(e, u, config = BlueCourtForms.getConfig(e)) {
  return `<h3>競賽項目</h3><label class="form-field">報名項目 *<select name="group" required>${options(
    config.groups.map((g) => [g, g]),
    config.groups[0],
  )}</select></label>
    <h3>報名資料</h3><div class="applicant-field-grid">${config.fields.map((f) => `<div data-applicant-field="${h(f.id)}">${registrationInput(f, u)}${f.description ? '<p class="muted-copy">' + h(f.description) + '</p>' : ''}</div>`).join('')}</div>
    <p>登入電子郵件：${h(u.email)}</p><h3>繳費資訊</h3>${paymentPreview(config.payment)}${externalSystemLink(config.external)}`;
}
function paymentPreview(p) {
  if (p.mode === 'free') return '<p class="payment-summary">免費報名，無需繳費。</p>';
  return `<div class="payment-summary"><strong>報名費 NT$ ${p.amount.toLocaleString('zh-TW')}／組</strong>
    <label class="form-field">預計繳費方式（僅預留）<select name="paymentMethod">${options([['', '尚未選擇'], ...p.methods.map((id) => [id, BlueCourtForms.paymentMethods[id]])], '')}</select></label>
    <p class="muted-copy">目前尚未開放付款；此選擇僅供主辦單位規劃，不會扣款或顯示已付款。</p>${p.note ? '<p>' + h(p.note) + '</p>' : ''}</div>`;
}
function submittedAnswers(entry) {
  if (!entry.answers) return '';
  const value = (v) =>
    typeof v === 'boolean'
      ? v
        ? '已勾選'
        : '未勾選'
      : v === null || v === undefined || v === ''
        ? '未填寫'
        : String(v);
  return `<details class="submitted-answers"><summary>查看報名資料</summary><dl>${entry.answers.map((a) => `<div><dt>${h(a.label)}</dt><dd>${h(value(a.value))}</dd></div>`).join('')}</dl>
    ${entry.payment?.mode === 'planned' ? '<p>報名費 NT$ ' + entry.payment.amount + ' · 預留方式：' + h(BlueCourtForms.paymentMethods[entry.payment.method] || '尚未選擇') + ' · 尚未開放付款</p>' : '<p>免費報名</p>'}</details>`;
}
