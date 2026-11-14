/* Event registration schema, shared by management and applicant views. */
(function (root) {
  'use strict';
  const baseFields = [
    {
      id: 'team',
      label: '選手／隊伍名稱',
      type: 'text',
      required: true,
      visible: true,
      locked: true,
    },
    { id: 'name', label: '姓名', type: 'text', required: true, visible: true, locked: true },
    { id: 'phone', label: '聯絡電話', type: 'tel', required: true, visible: true },
    { id: 'birthday', label: '出生日期', type: 'date', required: true, visible: true },
    {
      id: 'gender',
      label: '性別',
      type: 'select',
      required: false,
      visible: true,
      options: ['不透露', '男', '女', '其他'],
    },
    { id: 'address', label: '聯絡地址', type: 'text', required: false, visible: true },
    { id: 'emergencyName', label: '緊急聯絡人', type: 'text', required: true, visible: true },
    { id: 'emergencyPhone', label: '緊急聯絡電話', type: 'tel', required: true, visible: true },
  ];
  const types = {
    text: '單行文字',
    textarea: '多行文字',
    number: '數字',
    select: '下拉選單',
    checkbox: '勾選確認',
    date: '日期',
    email: '電子郵件',
    tel: '電話',
  };
  const paymentMethods = {
    bank_transfer: '銀行轉帳',
    credit_card: '信用卡',
    line_pay: 'LINE Pay',
    onsite: '現場繳費',
  };
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const text = (v) => String(v ?? '').trim();
  const fail = (message) => {
    throw new Error(message);
  };
  function conditionValue(value) {
    if (value === true || value === 'on') return 'true';
    if (value === false) return 'false';
    return text(value);
  }
  function visibleFields(config, data, now = new Date()) {
    const result = {};
    for (const field of config.fields) {
      let visible = field.visible;
      const condition = field.condition;
      if (visible && condition?.enabled) {
        const values = condition.rules.map((rule) => {
          if (rule.source === 'time') {
            const boundary = Date.parse(rule.value + '+08:00');
            return rule.operator === 'before'
              ? new Date(now).getTime() < boundary
              : new Date(now).getTime() >= boundary;
          }
          if (rule.fieldId !== 'group' && !result[rule.fieldId]) return false;
          const checkbox = config.fields.find((f) => f.id === rule.fieldId)?.type === 'checkbox';
          const raw = checkbox
            ? data[rule.fieldId] === true || data[rule.fieldId] === 'on'
            : data[rule.fieldId];
          const value = conditionValue(raw),
            expected = conditionValue(rule.value);
          switch (rule.operator) {
            case 'eq':
              return value === expected;
            case 'neq':
              return value !== expected;
            case 'contains':
              return value.includes(expected);
            case 'filled':
              return value !== '' && (!checkbox || value !== 'false');
            case 'empty':
              return value === '' || (checkbox && value === 'false');
            case 'gt':
              return value !== '' && Number(value) > Number(expected);
            case 'gte':
              return value !== '' && Number(value) >= Number(expected);
            case 'lt':
              return value !== '' && Number(value) < Number(expected);
            case 'lte':
              return value !== '' && Number(value) <= Number(expected);
            default:
              return false;
          }
        });
        const matched = condition.match === 'any' ? values.some(Boolean) : values.every(Boolean);
        visible = condition.effect === 'hide' ? !matched : matched;
      }
      result[field.id] = !!visible;
    }
    return result;
  }
  function sanitizeConditions(fields, rawFields, groups) {
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index],
        raw = rawFields[index].condition;
      if (!raw?.enabled) continue;
      if (field.locked) fail('姓名與選手／隊伍名稱不能設定顯示條件。');
      if (!['all', 'any'].includes(raw.match) || !['show', 'hide'].includes(raw.effect))
        fail('請確認顯示條件的連接方式與顯示設定。');
      if (!Array.isArray(raw.rules) || !raw.rules.length || raw.rules.length > 8)
        fail('啟用顯示條件時，請設定 1 至 8 個條件。');
      const rules = raw.rules.map((rule) => {
        if (rule.source === 'time') {
          if (
            !['before', 'after'].includes(rule.operator) ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rule.value) ||
            !Number.isFinite(Date.parse(rule.value + '+08:00'))
          )
            fail('請填寫有效的條件時間（台灣時間）。');
          return { source: 'time', operator: rule.operator, value: rule.value };
        }
        if (rule.source !== 'field') fail('顯示條件的來源無效。');
        const source = fields.findIndex((f) => f.id === rule.fieldId);
        if (rule.fieldId !== 'group' && (source < 0 || source >= index))
          fail('顯示條件只能使用前面題目的答案，請調整題目順序或條件。');
        if (
          !['eq', 'neq', 'contains', 'filled', 'empty', 'gt', 'gte', 'lt', 'lte'].includes(
            rule.operator,
          )
        )
          fail('顯示條件的比較方式無效。');
        const value = text(rule.value);
        if (!['filled', 'empty'].includes(rule.operator) && !value)
          fail('請填寫顯示條件的比較內容。');
        if (value.length > 2000) fail('顯示條件內容過長。');
        const sourceField =
          rule.fieldId === 'group' ? { type: 'select', options: groups } : fields[source];
        if (
          ['gt', 'gte', 'lt', 'lte'].includes(rule.operator) &&
          (sourceField.type !== 'number' || !Number.isFinite(Number(value)))
        )
          fail('數字比較只能用於數字題目，且需填寫有效數字。');
        if (
          ['eq', 'neq'].includes(rule.operator) &&
          sourceField.type === 'select' &&
          !sourceField.options.includes(value)
        )
          fail('顯示條件的選項已不存在，請重新選擇。');
        if (
          ['eq', 'neq'].includes(rule.operator) &&
          sourceField.type === 'checkbox' &&
          !['true', 'false'].includes(value)
        )
          fail('勾選題目的條件值應為 true 或 false。');
        return { source: 'field', fieldId: rule.fieldId, operator: rule.operator, value };
      });
      field.condition = { enabled: true, match: raw.match, effect: raw.effect, rules };
    }
  }
  function sanitizeExternal(raw = {}) {
    const enabled = !!raw.enabled,
      name = text(raw.name),
      purpose = raw.purpose || 'payment',
      note = text(raw.note);
    if (
      !['payment', 'registration', 'other'].includes(purpose) ||
      name.length > 80 ||
      note.length > 2000
    )
      fail('請確認外部系統名稱、用途與說明。');
    let url = '';
    if (text(raw.url)) {
      try {
        const parsed = new URL(text(raw.url));
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
          fail('網址無效。');
        url = parsed.href;
      } catch {
        fail('請填寫有效的 http 或 https 外部系統網址。');
      }
    }
    if (enabled && (!name || !url)) fail('啟用外部系統時，請填寫名稱與網址。');
    return { enabled, name, purpose, url, note };
  }
  function getConfig(e) {
    return e.registrationForm
      ? copy(e.registrationForm)
      : {
          revision: 0,
          groups: [...e.groups],
          fields: copy(baseFields),
          payment: { mode: 'free', amount: 0, methods: [], note: '' },
        };
  }
  function sanitizeConfig(raw) {
    const groups = [
      ...new Set(
        (Array.isArray(raw.groups) ? raw.groups : text(raw.groups).split(/[、,，\n]/))
          .map(text)
          .filter(Boolean),
      ),
    ];
    if (!groups.length || groups.length > 30 || groups.some((g) => g.length > 80))
      fail('請設定 1 至 30 個比賽項目，每項不超過 80 字。');
    if (
      !Array.isArray(raw.fields) ||
      raw.fields.length < baseFields.length ||
      raw.fields.length > 40
    )
      fail('報名欄位數量必須介於基本欄位數與 40 欄之間。');
    const fields = raw.fields.map((f) => {
      const base = baseFields.find((b) => b.id === f.id);
      if (!base && !/^extra_[a-z0-9_]{1,40}$/.test(f.id)) fail('自訂欄位識別碼無效。');
      const label = text(f.label),
        type = base?.type || f.type;
      if (!label || label.length > 80 || !Object.hasOwn(types, type))
        fail('請確認欄位名稱與欄位類型。');
      const visible = base?.locked ? true : !!f.visible;
      const field = {
        id: f.id,
        label,
        type,
        visible,
        required: base?.locked ? true : visible && !!f.required,
      };
      if (base?.locked) field.locked = true;
      if (type === 'select') {
        const values = Array.isArray(f.options) ? f.options : text(f.options).split(/[、,，\n]/);
        field.options = [...new Set(values.map(text).filter(Boolean))];
        if (
          !field.options.length ||
          field.options.length > 50 ||
          field.options.some((v) => v.length > 100)
        )
          fail('下拉選單需設定 1 至 50 個選項，每個選項不超過 100 字。');
      }
      if (text(f.description).length > 1000) fail('題目說明不能超過 1000 字。');
      field.description = text(f.description);
      return field;
    });
    if (
      new Set(fields.map((f) => f.id)).size !== fields.length ||
      baseFields.some((b) => !fields.some((f) => f.id === b.id))
    )
      fail('基本欄位不能刪除，欄位識別碼不能重複。');
    sanitizeConditions(fields, raw.fields, groups);
    const external = sanitizeExternal(raw.external);
    const p = raw.payment || {},
      mode = p.mode || 'free',
      amount = Number(p.amount || 0);
    if (
      !['free', 'planned'].includes(mode) ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > 1000000
    )
      fail('請確認繳費模式與報名費用。');
    const methods = [...new Set(p.methods || [])];
    if (methods.some((m) => !Object.hasOwn(paymentMethods, m))) fail('繳費方式無效。');
    if (mode === 'planned' && (amount <= 0 || !methods.length))
      fail('預留繳費時，請填寫正整數費用並至少選擇一種方式。');
    const note = text(p.note);
    if (note.length > 2000) fail('繳費說明請控制在 2000 字以內。');
    return {
      groups,
      fields,
      external,
      payment: {
        mode,
        amount: mode === 'free' ? 0 : amount,
        methods: mode === 'free' ? [] : methods,
        note,
      },
    };
  }
  function validateApplication(e, data, user) {
    const config = getConfig(e),
      answers = [],
      contact = {};
    if (data.formRevision !== undefined && Number(data.formRevision) !== config.revision)
      fail('報名表已更新，請重新開啟報名頁確認最新欄位。');
    const visibility = visibleFields(config, { ...user, ...data });
    for (const f of config.fields.filter((f) => visibility[f.id])) {
      const fallback = f.id === 'team' ? '' : user[f.id];
      let value =
        f.type === 'checkbox'
          ? data[f.id] === true || data[f.id] === 'on'
          : text(data[f.id] ?? fallback);
      if (f.required && (f.type === 'checkbox' ? !value : !value))
        fail('請填妥報名資料：' + f.label + '為必填。');
      if (f.type !== 'checkbox' && value) {
        if (value.length > (f.type === 'textarea' ? 5000 : 2000)) fail(f.label + '內容過長。');
        if (f.type === 'number' && !Number.isFinite(Number(value)))
          fail(f.label + '必須是有效數字。');
        if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          fail(f.label + '格式不正確。');
        if (f.type === 'tel' && !/^[+\d ()-]{7,20}$/.test(value)) fail(f.label + '格式不正確。');
        if (
          f.type === 'date' &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))
        )
          fail(f.label + '日期無效。');
        if (f.id === 'birthday' && value > new Date().toISOString().slice(0, 10))
          fail('出生日期不能晚於今天。');
        if (f.type === 'select' && !f.options.includes(value)) fail(f.label + '請選擇有效選項。');
        if (f.type === 'number') value = Number(value);
      }
      answers.push({ id: f.id, label: f.label, type: f.type, value });
      if (baseFields.some((b) => b.id === f.id) && f.id !== 'team') contact[f.id] = value;
    }
    const method = text(data.paymentMethod);
    if (method && (config.payment.mode !== 'planned' || !config.payment.methods.includes(method)))
      fail('請選擇有效的預留繳費方式。');
    return {
      answers,
      contact,
      payment: {
        ...copy(config.payment),
        method,
        status: config.payment.mode === 'free' ? 'not_required' : 'not_connected',
      },
      formSnapshot: config,
    };
  }
  const api = {
    baseFields,
    types,
    paymentMethods,
    getConfig,
    sanitizeConfig,
    validateApplication,
    visibleFields,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlueCourtForms = api;
})(globalThis);
