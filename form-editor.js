/* Two-pane event form editor. */
function conditionRuleRow(rule, fields, fieldId) {
  const stop = fields.findIndex((f) => f.id === fieldId),
    prior = fields.slice(0, Math.max(0, stop));
  const sources = [['group', '比賽項目'], ...prior.map((f) => [f.id, f.label])];
  if (rule.fieldId && !sources.some(([id]) => id === rule.fieldId))
    sources.push([rule.fieldId, '來源題目已移除或移至後方']);
  const time = rule.source === 'time';
  return `<div class="condition-rule" data-condition-rule>
    <div class="condition-rule-heading"><strong>條件</strong>${button('移除', 'remove-condition', '', 'text-button')}</div>
    <label class="form-field">條件類型<select class="condition-source">${options(
      [
        ['field', '其他題目的答案／比賽項目'],
        ['time', '指定時間（台灣時間）'],
      ],
      rule.source || 'field',
    )}</select></label>
    <label class="form-field condition-field-wrap" ${time ? 'hidden' : ''}>選擇題目<select class="condition-field">${options(sources, rule.fieldId || 'group')}</select></label>
    <div class="form-grid"><label class="form-field">比較方式<select class="condition-operator">${options(
      time
        ? [
            ['before', '早於'],
            ['after', '到達或晚於'],
          ]
        : [
            ['eq', '等於'],
            ['neq', '不等於'],
            ['contains', '包含文字'],
            ['filled', '已填寫／已勾選'],
            ['empty', '未填寫／未勾選'],
            ['gt', '大於'],
            ['gte', '大於或等於'],
            ['lt', '小於'],
            ['lte', '小於或等於'],
          ],
      rule.operator || 'eq',
    )}</select></label>
    <label class="form-field condition-value-wrap" ${['filled', 'empty'].includes(rule.operator) ? 'hidden' : ''}>${time ? '指定時間' : '比較內容'}<input class="condition-value" type="${time ? 'datetime-local' : 'text'}" value="${h(rule.value || '')}" placeholder="例如：是、校友組；勾選題用 true／false" maxlength="2000"></label></div>
  </div>`;
}
function schemaFieldRow(f, index = 0, fields = []) {
  const base = BlueCourtForms.baseFields.find((b) => b.id === f.id),
    locked = base?.locked;
  const c = f.condition || { enabled: false, match: 'all', effect: 'show', rules: [] };
  return `<article class="schema-row" data-schema-row data-field-id="${h(f.id)}" hidden>
    <div class="schema-row-heading"><strong>${base ? '基本題目' : '自訂題目'}</strong><div class="schema-row-actions">${button('↑', 'move-schema-up', 'aria-label="題目上移"', 'text-button')}${button('↓', 'move-schema-down', 'aria-label="題目下移"', 'text-button')}${button('複製', 'duplicate-schema-field', '', 'text-button')}${base ? '' : button('刪除', 'remove-schema-field', '', 'text-button')}</div></div>
    <nav class="schema-inspector-tabs" aria-label="題目設定">${[
      ['content', '內容'],
      ['answer', '作答設定'],
      ['conditions', '顯示條件'],
    ]
      .map(([key, label]) =>
        button(label, 'schema-panel', `data-panel="${key}" aria-pressed="${key === 'content'}"`),
      )
      .join('')}</nav>
    <section data-schema-panel="content">
      <label class="form-field">題目名稱<input class="schema-label" value="${h(f.label)}" maxlength="80"></label>
      <label class="form-field">題目說明（選填）<textarea class="schema-description" maxlength="1000" rows="3" placeholder="可說明填寫方式">${h(f.description || '')}</textarea></label>
      <label class="form-field">題目類型<select class="schema-type" ${base ? 'disabled' : ''}>${options(Object.entries(BlueCourtForms.types), f.type)}</select></label>
    </section>
    <section data-schema-panel="answer" hidden>
      <div class="schema-answer-toggles"><label class="schema-toggle"><input class="schema-visible" type="checkbox" ${f.visible ? 'checked' : ''} ${locked ? 'disabled' : ''}>顯示此題目</label>
      <label class="schema-toggle"><input class="schema-required" type="checkbox" ${f.required ? 'checked' : ''} ${locked ? 'disabled' : ''}>必填${locked ? '（固定）' : ''}</label></div>
      <label class="form-field schema-option-field" ${f.type === 'select' ? '' : 'hidden'}>選項（以頓號或逗號分隔）<input class="schema-options" value="${h((f.options || []).join('、'))}" placeholder="例如：S、M、L、XL"></label>
    </section>
    <section data-schema-panel="conditions" hidden>
      <h4>顯示條件</h4><p class="muted-copy">依比賽項目、前面題目的答案或時間，決定是否顯示此題目。</p>
      <label class="schema-toggle"><input class="condition-enabled" type="checkbox" ${c.enabled ? 'checked' : ''} ${locked ? 'disabled' : ''}>啟用條件顯示</label>
      <p class="muted-copy">${locked ? '此題為固定必填，不設定顯示條件。' : '未啟用時，依作答設定的「顯示此題目」決定是否顯示。'}</p>
      <div class="condition-settings" ${c.enabled ? '' : 'hidden'}>
        <div class="form-grid"><label class="form-field">符合條件時<select class="condition-effect">${options(
          [
            ['show', '顯示此題目'],
            ['hide', '隱藏此題目'],
          ],
          c.effect,
        )}</select></label>
        <label class="form-field">條件連接方式<select class="condition-match">${options(
          [
            ['all', '全部符合（AND）'],
            ['any', '任一符合（OR）'],
          ],
          c.match,
        )}</select></label></div>
        <div class="condition-rules">${c.rules.map((rule) => conditionRuleRow(rule, fields, f.id)).join('')}</div>
        ${button('＋ 新增條件', 'add-condition')}
      </div>
    </section>
  </article>`;
}
function formManagementView(e) {
  const config = BlueCourtForms.getConfig(e),
    external = config.external || {
      enabled: false,
      name: '',
      purpose: 'payment',
      url: '',
      note: '',
    };
  return `${heading('表單管理', e.name)}
    <p class="muted-copy">左側選擇題目，右側設定內容、作答方式與顯示條件。儲存後套用至報名頁，舊報名保留原始內容。</p>
    <form class="workflow-form registration-builder" data-form="registration-settings" data-event="${h(e.id)}">
      <input name="revision" type="hidden" value="${config.revision}">
      <h3>比賽項目</h3>${field('競賽項目（以頓號或逗號分隔）', 'groups', config.groups.join('、'), 'text', 'required')}
      <p class="muted-copy">已有報名或賽程的項目不能直接移除或改名。</p>
      <h3>報名表單設定</h3>
      <div class="schema-editor-layout"><aside class="schema-sidebar"><div class="schema-sidebar-heading"><strong>題目清單</strong>${button('＋ 新增題目', 'add-schema-field', '', 'text-button')}</div><nav class="schema-outline" aria-label="報名題目清單"></nav></aside>
      <div id="schemaFields">${config.fields.map((f, i) => schemaFieldRow(f, i, config.fields)).join('')}</div></div>
      <h3>繳費方式（預留）</h3>
      <label class="form-field">費用設定<select name="paymentMode">${options(
        [
          ['free', '免費報名'],
          ['planned', '預留繳費設定'],
        ],
        config.payment.mode,
      )}</select></label>
      <fieldset class="payment-planning" data-payment-details ${config.payment.mode === 'planned' ? '' : 'hidden'}><legend>繳費資訊</legend>
      ${field('每組報名費（新臺幣）', 'paymentAmount', config.payment.amount, 'number', 'min="0" max="1000000" step="1"')}
      <div class="payment-method-options">${Object.entries(BlueCourtForms.paymentMethods)
        .map(
          ([id, label]) =>
            `<label><input type="checkbox" name="paymentMethods" value="${id}" ${config.payment.methods.includes(id) ? 'checked' : ''}>${label}</label>`,
        )
        .join('')}</div></fieldset>
      <label class="form-field">繳費補充說明<textarea name="paymentNote" rows="3" maxlength="2000">${h(config.payment.note)}</textarea></label>
      <h3>外部系統連結（預留）</h3>
      <label class="schema-toggle"><input name="externalEnabled" type="checkbox" ${external.enabled ? 'checked' : ''}>顯示外部系統連結</label>
      <div class="form-grid">${field('外部系統名稱', 'externalName', external.name, 'text', 'maxlength="80" placeholder="例如：主辦單位繳費平台"')}
      <label class="form-field">連結用途<select name="externalPurpose">${options(
        [
          ['payment', '繳費系統'],
          ['registration', '報名系統'],
          ['other', '其他系統'],
        ],
        external.purpose,
      )}</select></label></div>
      ${field('外部系統網址', 'externalUrl', external.url, 'url', 'placeholder="https://..."')}
      <label class="form-field">連結說明<textarea name="externalNote" rows="2" maxlength="2000">${h(external.note)}</textarea></label>
      <p class="notice">外部系統會另開分頁，不自動傳送報名資料或同步付款結果。目前不扣款或確認入帳。</p>
      <div class="inline-actions"><button type="submit" class="primary-button">儲存表單設定</button>${button('預覽報名表', 'preview-schema')}</div>
      <p class="muted-copy">目前版本：${config.revision === 0 ? '預設表單' : config.revision}</p>
    </form>`;
}
function readRegistrationSettings(form) {
  return {
    revision: Number(form.elements.revision.value),
    groups: form.elements.groups.value,
    fields: [...form.querySelectorAll('[data-schema-row]')].map((row) => ({
      id: row.dataset.fieldId,
      label: row.querySelector('.schema-label').value,
      description: row.querySelector('.schema-description').value,
      type: row.querySelector('.schema-type').value,
      visible: row.querySelector('.schema-visible').checked,
      required: row.querySelector('.schema-required').checked,
      options: row
        .querySelector('.schema-options')
        .value.split(/[、,，\n]/)
        .map((v) => v.trim())
        .filter(Boolean),
      condition: {
        enabled: row.querySelector('.condition-enabled').checked,
        match: row.querySelector('.condition-match').value,
        effect: row.querySelector('.condition-effect').value,
        rules: [...row.querySelectorAll('[data-condition-rule]')].map((rule) => ({
          source: rule.querySelector('.condition-source').value,
          fieldId: rule.querySelector('.condition-field').value,
          operator: rule.querySelector('.condition-operator').value,
          value: rule.querySelector('.condition-value').value,
        })),
      },
    })),
    payment: {
      mode: form.elements.paymentMode.value,
      amount: form.elements.paymentAmount.value,
      methods: [...form.querySelectorAll('[name=paymentMethods]:checked')].map((el) => el.value),
      note: form.elements.paymentNote.value,
    },
    external: {
      enabled: form.elements.externalEnabled.checked,
      name: form.elements.externalName.value,
      purpose: form.elements.externalPurpose.value,
      url: form.elements.externalUrl.value,
      note: form.elements.externalNote.value,
    },
  };
}
function refreshSchemaOutline(form, selectedId, panel) {
  if (!form) return;
  const rows = [...form.querySelectorAll('[data-schema-row]')];
  const selected = rows.some((r) => r.dataset.fieldId === selectedId)
    ? selectedId
    : form.dataset.selectedField;
  const chosen = rows.find((r) => r.dataset.fieldId === selected) || rows[0];
  if (!chosen) return;
  form.dataset.selectedField = chosen.dataset.fieldId;
  form.dataset.editorPanel = panel || form.dataset.editorPanel || 'content';
  form.querySelector('.schema-outline').innerHTML = rows
    .map((row, index) => {
      const required = row.querySelector('.schema-required').checked,
        condition = row.querySelector('.condition-enabled').checked;
      return `<button type="button" class="schema-outline-item" data-command="select-schema-field" data-field="${h(row.dataset.fieldId)}" aria-pressed="${row === chosen}">
      <span class="schema-question-number">${index + 1}</span><span><strong>${h(row.querySelector('.schema-label').value || '未命名題目')}</strong>
      <span class="schema-question-badges"><small>${h(BlueCourtForms.types[row.querySelector('.schema-type').value])}</small>${required ? '<small class="required-badge">必填</small>' : ''}${condition ? '<small class="condition-badge">有顯示條件</small>' : ''}</span></span></button>`;
    })
    .join('');
  const outline = form.querySelector('.schema-outline'),
    active = outline.querySelector('[aria-pressed=true]');
  if (active) {
    const top =
      active.getBoundingClientRect().top - outline.getBoundingClientRect().top + outline.scrollTop;
    if (top < outline.scrollTop) outline.scrollTop = top;
    else if (top + active.offsetHeight > outline.scrollTop + outline.clientHeight)
      outline.scrollTop = top + active.offsetHeight - outline.clientHeight;
  }
  const fieldData = readRegistrationSettings(form).fields;
  for (let index = 0; index < rows.length; index++)
    for (const rule of rows[index].querySelectorAll('[data-condition-rule]')) {
      const input = rule.querySelector('.condition-field'),
        current = input.value;
      const choices = [
        ['group', '比賽項目'],
        ...fieldData.slice(0, index).map((f) => [f.id, f.label || '未命名題目']),
      ];
      if (current && !choices.some(([id]) => id === current))
        choices.push([current, '來源題目已移除或移至後方']);
      input.innerHTML = options(choices, current);
    }
  for (const row of rows) {
    row.hidden = row !== chosen;
    row.classList.toggle('active', row === chosen);
    for (const section of row.querySelectorAll('[data-schema-panel]'))
      section.hidden = section.dataset.schemaPanel !== form.dataset.editorPanel;
    for (const tab of row.querySelectorAll('[data-command=schema-panel]'))
      tab.setAttribute('aria-pressed', String(tab.dataset.panel === form.dataset.editorPanel));
  }
}
function updateConditionRule(ruleRow) {
  const source = ruleRow.querySelector('.condition-source').value,
    time = source === 'time';
  const operator = ruleRow.querySelector('.condition-operator'),
    old = operator.value;
  operator.innerHTML = options(
    time
      ? [
          ['before', '早於'],
          ['after', '到達或晚於'],
        ]
      : [
          ['eq', '等於'],
          ['neq', '不等於'],
          ['contains', '包含文字'],
          ['filled', '已填寫／已勾選'],
          ['empty', '未填寫／未勾選'],
          ['gt', '大於'],
          ['gte', '大於或等於'],
          ['lt', '小於'],
          ['lte', '小於或等於'],
        ],
    old,
  );
  ruleRow.querySelector('.condition-field-wrap').hidden = time;
  ruleRow.querySelector('.condition-value').type = time ? 'datetime-local' : 'text';
  ruleRow.querySelector('.condition-value-wrap').hidden = ['filled', 'empty'].includes(
    operator.value,
  );
}
function readApplicantValues(root) {
  const data = {};
  for (const input of root.querySelectorAll('input[name],select[name],textarea[name]'))
    data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
  return data;
}
function applyRegistrationConditions(root, config, now = new Date()) {
  if (!root) return;
  const visibility = BlueCourtForms.visibleFields(config, readApplicantValues(root), now);
  for (const wrapper of root.querySelectorAll('[data-applicant-field]')) {
    const field = config.fields.find((f) => f.id === wrapper.dataset.applicantField);
    if (!field) continue;
    const visible = visibility[field.id];
    wrapper.hidden = !visible;
    for (const input of wrapper.querySelectorAll('input,select,textarea')) {
      input.disabled = !visible;
      input.required = visible && field.required;
    }
  }
}
function externalSystemLink(external) {
  if (!external?.enabled) return '';
  let url;
  try {
    url = new URL(external.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
  } catch {
    return '';
  }
  return `<section class="external-system"><h3>外部系統</h3><p>${h(external.note || '依主辦單位說明前往外部系統。')}</p>
    <a class="secondary-button" href="${h(url.href)}" target="_blank" rel="noopener noreferrer">${h(external.name)} ↗</a>
    <p class="muted-copy">另開分頁，不自動傳送報名資料；外部操作結果不會自動同步至此報名或付款狀態。</p></section>`;
}
