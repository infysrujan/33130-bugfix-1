import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

/**
 * SME Loan Calculator
 *
 * Authoring model (matches the Universal Editor structure):
 *   - A "Tab Section" contains one "SME Loan Calculator" block per tab.
 *   - The block's own rows author: button name, default result value, description,
 *     2nd button name, result text, error message.
 *   - Each child "SME Field" row authors: Id, Label, Group Title, Unit name, Value Type.
 *
 * Each tab's formula is fetched from /content/bangkokbank/configs by key:
 *   sme-monthly-payment, sme-loan-balance, sme-term-period-monthly, sme-working-capital-needs
 * The field Ids (P, A, n, i, B, C, D, ...) are the variables used in those formulas.
 *
 * This file is deliberately tab-agnostic: it discovers the field Ids, picks the
 * matching config formula, and evaluates it. Interest-rate handling is driven by
 * the formula text itself rather than hardcoded per tab.
 */
export default async function decorate(block) {
  const placeholders = await fetchPlaceholders();

  // ── Generic DOM helpers ──
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function appendTh(row, text, opts = {}) {
    const th = document.createElement('th');
    th.className = 'lineth';
    if (opts.rowSpan) th.rowSpan = opts.rowSpan;
    if (opts.colSpan) th.colSpan = opts.colSpan;
    const inner = document.createElement('span');
    inner.className = 'lineth-inner';
    inner.textContent = text;
    th.appendChild(inner);
    row.appendChild(th);
    return th;
  }

  function appendTd(row, text) {
    const td = document.createElement('td');
    td.className = 'linetd alignc';
    td.textContent = text;
    row.appendChild(td);
  }

  // ── CSP-safe recursive-descent expression evaluator ──
  // Supports + - * / , ^ and **, unary +/-, parentheses, and Math.log( ).
  // Object-literal form avoids mutual no-use-before-define lint issues.
  function evalExpr(str) {
    const p = {
      pos: 0,
      peek() {
        return str[this.pos];
      },
      parseNumber() {
        let s = '';
        while (this.pos < str.length && /[\d.]/.test(this.peek())) {
          s += str[this.pos];
          this.pos += 1;
        }
        return s ? parseFloat(s) : NaN;
      },
      parseFactor() {
        if (str.startsWith('Math.log(', this.pos)) {
          this.pos += 9;
          const val = this.parseExpression();
          if (this.peek() === ')') this.pos += 1;
          return Math.log(val);
        }
        if (this.peek() === '(') {
          this.pos += 1;
          const val = this.parseExpression();
          if (this.peek() === ')') this.pos += 1;
          return val;
        }
        return this.parseNumber();
      },
      parseUnary() {
        if (this.peek() === '-') {
          this.pos += 1;
          return -this.parseFactor();
        }
        if (this.peek() === '+') {
          this.pos += 1;
          return this.parseFactor();
        }
        return this.parseFactor();
      },
      parsePower() {
        const base = this.parseUnary();
        if (this.pos < str.length && this.peek() === '^') {
          this.pos += 1;
          return base ** this.parsePower();
        }
        if (this.pos < str.length && this.peek() === '*' && str[this.pos + 1] === '*') {
          this.pos += 2;
          return base ** this.parsePower();
        }
        return base;
      },
      parseTerm() {
        let left = this.parsePower();
        while (this.pos < str.length) {
          if (this.peek() === '*' && str[this.pos + 1] !== '*') {
            this.pos += 1;
            left *= this.parsePower();
          } else if (this.peek() === '/') {
            this.pos += 1;
            left /= this.parsePower();
          } else {
            break;
          }
        }
        return left;
      },
      parseExpression() {
        let left = this.parseTerm();
        while (this.pos < str.length && (this.peek() === '+' || this.peek() === '-')) {
          const op = str[this.pos];
          this.pos += 1;
          const right = this.parseTerm();
          left = op === '+' ? left + right : left - right;
        }
        return left;
      },
    };
    return p.parseExpression();
  }

  /**
   * Normalize an authored formula ("A = P*(...)" / "n = [lnA-ln(A-Pi)]/ln(1+i)")
   * into a numeric result given a map of variable -> value.
   */
  function formulaCompute(formulaStr, vals) {
    if (!formulaStr) return NaN;
    const eqIdx = formulaStr.indexOf('=');
    // Use the right-hand side if present, otherwise treat the whole string as an expression.
    let expr = (eqIdx === -1 ? formulaStr : formulaStr.slice(eqIdx + 1)).trim();

    expr = expr.replace(/\[/g, '(').replace(/\]/g, ')');
    expr = expr.replace(/\bln\s*\(/g, 'Math.log(');
    expr = expr.replace(/\bln([A-Za-z])\b/g, 'Math.log($1)');
    expr = expr.replace(/\s+/g, '');
    // Insert implicit multiplications: 2( -> 2*( , )( -> )*( , )x -> )*x
    expr = expr.replace(/(?<![.\w])([A-Za-z0-9])\(/g, '$1*(');
    expr = expr.replace(/\)\(/g, ')*(');
    expr = expr.replace(/\)([A-Za-z])/g, ')*$1');

    const varSet = new Set(Object.keys(vals));

    // Adjacent single-letter variables (e.g. "Pi" -> "P*i") only when both are known vars.
    expr = expr.replace(/\b([A-Za-z])([A-Za-z])\b/g, (m, a, b) => {
      if (varSet.has(a) && varSet.has(b)) return `${a}*${b}`;
      return m;
    });

    // Balance any unclosed parentheses defensively.
    const diff = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
    if (diff > 0) expr += ')'.repeat(diff);

    // Substitute variables (longest first so multi-char names win; ids are single-char here).
    [...varSet].sort((a, b) => b.length - a.length).forEach((name) => {
      expr = expr.replace(new RegExp(`(?<![\\w.])${name}(?!\\w)`, 'g'), `(${vals[name]})`);
    });

    return evalExpr(expr.replace(/\s+/g, ''));
  }

  // ── Field card builder ──
  function buildFieldCard(f) {
    const card = el('div', 'col-md-4 paddingcal');
    const box = el('div', 'box-textbox');

    const lblCol = el('div', 'col-md-6 col-xs-6');
    const lbl = el('label', 'label-cal');
    lbl.setAttribute('for', f.id);
    lbl.textContent = f.label;
    lblCol.appendChild(lbl);

    const inpCol = el('div', 'col-md-6 col-xs-6 alignright');
    const inp = el('input', 'textbox-cal');
    inp.type = 'text';
    inp.id = f.id;
    inp.autocomplete = 'off';
    const isDecimal = f.valueType === 'decimal' && !['H', 'C', 'F'].includes(f.id);
    inp.inputMode = isDecimal ? 'decimal' : 'numeric';
    inp.value = isDecimal ? '0.00' : '0';
    inpCol.appendChild(inp);

    box.appendChild(lblCol);
    box.appendChild(inpCol);
    card.appendChild(box);

    if (f.bottomText) {
      const bt = el('div', 'fontcondition alignright padbottom25');
      bt.textContent = f.bottomText;
      card.appendChild(bt);
    }
    return card;
  }

  // ── Parse the authored block rows ──
  const rows = [...block.children];
  const cellText = (row, col = 0) => row?.children[col]?.textContent.trim() ?? '';

  const buttonName = cellText(rows[0]);
  const resultValue = cellText(rows[1]) || '0.00';
  const description = cellText(rows[2]);
  const addToTableButtonName = cellText(rows[3]);
  const hasResultText = rows[4]?.children.length === 1;
  const resultText = hasResultText ? cellText(rows[4]) : '';
  const hasErrorMessage = hasResultText && rows[5]?.children.length === 1;
  const errorMessage = hasErrorMessage ? cellText(rows[5]) : '';

  let fieldStart = 4;
  if (hasResultText) fieldStart = hasErrorMessage ? 6 : 5;

  // SME Field columns: Id | Label | Group Title | Unit name | Value Type
  const fields = rows.slice(fieldStart).map((r) => ({
    id: cellText(r, 0),
    label: cellText(r, 1),
    topText: cellText(r, 2),
    bottomText: cellText(r, 3),
    // Authoring uses "Integer"/"Decimal" (capitalized); every comparison here is lowercase.
    valueType: (cellText(r, 4) || 'integer').toLowerCase(),
  })).filter((f) => f.id); // drop any stray/empty rows so no field has an empty id

  const ids = fields.map((f) => f.id);

  // ── Determine which tab/formula this block represents ──
  // Detection is by the unique field-id signature of each tab.
  let calcType = 'monthly';
  if (ids.includes('H')) calcType = 'wc';
  else if (ids.includes('A') && ids.includes('n') && !ids.includes('P')) calcType = 'loanbalance';
  else if (ids.includes('P') && ids.includes('A') && !ids.includes('n')) calcType = 'term';

  const configKeyMap = {
    monthly: 'smeMonthlyPayment',
    loanbalance: 'smeLoanBalance',
    term: 'smeTermPeriodMonthly',
    wc: 'smeWorkingCapitalNeeds',
  };

  const siteConfigs = await fetchConfigs();
  const formulaDescription = siteConfigs[configKeyMap[calcType]] || '';

  // Result presentation per tab. `integer` => round up to whole months.
  const resultConfig = {
    monthly: { suffix: ' baht.', integer: false },
    loanbalance: { suffix: ' baht.', integer: false },
    term: { suffix: ' month.', integer: true },
    wc: { suffix: ' baht.', integer: false },
  };
  const rc = { prefix: resultText, ...resultConfig[calcType] };

  /**
   * Decide how a field's value should be fed into the formula.
   *
   * The only conversion the SME formulas need is annual-percent -> monthly-decimal
   * for the conventional interest rate `i`, and only when the formula uses `i` bare
   * (i.e. it does not already divide it by 100 itself). The amortization formulas
   * (loan balance, term) use a bare `i`, so we convert annual% / 1200. The monthly
   * formula divides `i/100` itself, so `i` is passed raw there.
   *
   * Every other field — including other percentage inputs like D, G or coefficients
   * like H in the working-capital formula — is passed exactly as typed, because those
   * formulas already include their own `/100` where needed.
   */
  const formulaNoSpace = formulaDescription.replace(/\s+/g, '');
  const fieldScale = (id) => {
    if (id !== 'i') return 1;
    const dividesItself = /i\)?\/100/.test(formulaNoSpace) || formulaNoSpace.includes('i/100');
    return dividesItself ? 1 : 1 / 1200;
  };

  // ── Group fields into rows (max 3 per row; a non-empty Group Title starts a new group) ──
  const fieldGroups = [];
  let cur = { header: '', fields: [] };
  fields.forEach((f) => {
    const newGroup = f.topText !== '' || cur.fields.length >= 3;
    if (newGroup && cur.fields.length > 0) {
      fieldGroups.push(cur);
      cur = { header: f.topText, fields: [f] };
    } else {
      if (f.topText) cur.header = f.topText;
      cur.fields.push(f);
    }
  });
  if (cur.fields.length) fieldGroups.push(cur);

  // ── Build DOM ──
  // Hide original rows instead of removing them so UE data-aue-* attributes stay in the DOM.
  rows.forEach((r) => { r.style.display = 'none'; });

  const dark = el('div', 'sme-calc-dark-section');
  fieldGroups.forEach((group) => {
    const row = el('div', 'row paddingmain');
    if (group.header) {
      const hdr = el('div', 'fontcontent');
      hdr.textContent = group.header;
      row.appendChild(hdr);
    }
    group.fields.forEach((f) => row.appendChild(buildFieldCard(f)));
    dark.appendChild(row);
  });

  const btnRow = el('div', 'row paddingmain alignc');
  const calcBtn = el('button', 'sme-calc-btn');
  calcBtn.type = 'button';
  calcBtn.textContent = buttonName || placeholders.smeCalcButton || 'CALCULATE';
  btnRow.appendChild(calcBtn);
  dark.appendChild(btnRow);
  block.appendChild(dark);

  // Result section
  const resultSection = el('div', 'sme-calc-result-section');
  const resultLabel = el('p', 'sme-calc-result-label');
  resultLabel.textContent = `${resultValue}`;
  resultSection.appendChild(resultLabel);
  let resultNum = null;

  if (description) {
    const dp = el('p', 'sme-calc-description');
    dp.textContent = description;
    resultSection.appendChild(dp);
  }

  const addBtn = el('button', 'sme-calc-add-table-btn');
  addBtn.type = 'button';
  addBtn.textContent = addToTableButtonName || placeholders.smeAddTableButton || 'ADD TO TABLE';
  resultSection.appendChild(addBtn);
  block.appendChild(resultSection);

  // Comparison table (revealed on first ADD TO TABLE)
  const tableSection = el('div', 'sme-calc-table-section');
  tableSection.hidden = true;

  const tableHeading = el('h2', 'sme-calc-table-heading');
  tableHeading.textContent = placeholders.smeCompareHeading || 'Compare your Result';
  tableSection.appendChild(tableHeading);

  const resultColHeader = {
    monthly: placeholders.smeResultColMonthly || 'Loan Payment',
    loanbalance: placeholders.smeResultColLoanbalance || 'Loan Balance',
    term: placeholders.smeResultColTerm || 'Term',
    wc: placeholders.smeResultColWc || 'Working Capital',
  };

  // Some table column headers come from placeholders instead of the authored field label.
  const FIELD_HEADER_PLACEHOLDERS = {
    n: 'smeResultColTerm',
    H: 'smeResultColInventory',
  };
  const fieldHeaderLabel = (f) => {
    const key = FIELD_HEADER_PLACEHOLDERS[f.id];
    return key ? (placeholders[key] || f.label) : f.label;
  };

  // Comparison-table-only column order: under the Account Receivable / Account Payable
  // groups, "Credit Term" swaps with the 3rd column so it renders last. The input form
  // above (built from fieldGroups directly) keeps the authored order.
  const TABLE_COLUMN_SWAP_GROUPS = ['account receivable', 'account payable'];
  const tableGroupFields = (group) => {
    const isSwapGroup = TABLE_COLUMN_SWAP_GROUPS.includes(group.header.trim().toLowerCase());
    if (!isSwapGroup || group.fields.length < 3) return group.fields;
    const reordered = [...group.fields];
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    return reordered;
  };
  const tableFieldGroups = fieldGroups.map((group) => ({
    ...group,
    fields: tableGroupFields(group),
  }));
  const tableFields = tableFieldGroups.flatMap((group) => group.fields);

  const resulttbl = el('div', 'resulttbl');
  const table = el('table', 'tablelong fontcomparetable');
  const thead = document.createElement('thead');
  const hasGroups = tableFieldGroups.some((g) => g.header && g.fields.length > 1);

  if (hasGroups) {
    const row1 = document.createElement('tr');
    const row2 = document.createElement('tr');
    appendTh(row1, resultColHeader[calcType], { rowSpan: 2 });
    tableFieldGroups.forEach((group) => {
      if (group.header && group.fields.length > 1) {
        appendTh(row1, group.header, { colSpan: group.fields.length });
        group.fields.forEach((f) => appendTh(row2, fieldHeaderLabel(f)));
      } else {
        group.fields.forEach((f) => appendTh(row1, fieldHeaderLabel(f), { rowSpan: 2 }));
      }
    });
    thead.appendChild(row1);
    thead.appendChild(row2);
  } else {
    const headerRow = document.createElement('tr');
    appendTh(headerRow, resultColHeader[calcType]);
    tableFields.forEach((f) => appendTh(headerRow, fieldHeaderLabel(f)));
    thead.appendChild(headerRow);
  }

  const tbody = el('tbody', 'fontcompareno');
  table.appendChild(thead);
  table.appendChild(tbody);
  resulttbl.appendChild(table);
  tableSection.appendChild(resulttbl);
  block.appendChild(tableSection);

  // ── Values & calculation ──
  let lastResult = null;

  const getVal = (id) => {
    const inp = block.querySelector(`#${id}`);
    if (!inp) return 0;
    const v = parseFloat(inp.value.replace(/,/g, ''));
    return Number.isFinite(v) ? v : 0;
  };

  const fmt = (n, dec = 2) => {
    if (!Number.isFinite(n)) return 'N/A';
    return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  // Build the variable map, applying the annual->monthly conversion only where needed.
  const compute = () => {
    const vals = {};
    fields.forEach((f) => {
      vals[f.id] = getVal(f.id) * fieldScale(f.id);
    });
    return formulaCompute(formulaDescription, vals);
  };

  const touchedDecimalFields = new Set();

  function validateAndMarkErrors() {
    fields.forEach((f) => {
      block.querySelector(`#${f.id}`)?.classList.remove('input-error');
    });

    let hasError = false;
    let showMessage = false;

    // Scenarios 1–3: highlight the first field whose value is 0
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i];
      if (getVal(f.id) === 0) {
        block.querySelector(`#${f.id}`)?.classList.add('input-error');
        hasError = true;
        // Show error message only when the user has interacted with this decimal field
        if (f.valueType === 'decimal' && touchedDecimalFields.has(f.id)) {
          showMessage = true;
        }
        break;
      }
    }

    // Scenario 4: decimal fields with value > 100 — red highlight only, no message
    fields.forEach((f) => {
      if (f.valueType === 'decimal' && getVal(f.id) > 100) {
        block.querySelector(`#${f.id}`)?.classList.add('input-error');
        hasError = true;
      }
    });

    return { valid: !hasError, showMessage };
  }

  const showError = (msg) => {
    resultLabel.textContent = '';
    resultLabel.style.whiteSpace = 'pre-wrap';
    resultNum = el('strong', 'sme-result-number');
    resultNum.textContent = msg;
    resultLabel.append(resultNum);
    lastResult = null;
  };

  function clearFormAndResult() {
    fields.forEach((f) => {
      const inp = block.querySelector(`#${f.id}`);
      if (!inp) return;
      const isDecimal = f.valueType === 'decimal' && !['H', 'C', 'F'].includes(f.id);
      inp.value = isDecimal ? '0.00' : '0';
      inp.classList.remove('input-error');
    });
    touchedDecimalFields.clear();
    lastResult = null;
    resultLabel.textContent = `${resultValue}`;
    resultLabel.style.whiteSpace = '';
    tbody.innerHTML = '';
    tableSection.hidden = true;
  }

  calcBtn.addEventListener('click', () => {
    const { valid, showMessage } = validateAndMarkErrors();
    if (!valid) {
      if (showMessage) showError(`${resultText} ${errorMessage}`);
      return;
    }

    const raw = compute();
    // Term must be a positive, finite number of months; other tabs just need a finite number.
    const invalid = !Number.isFinite(raw) || (calcType === 'term' && !(raw > 0));
    if (invalid) {
      showError(errorMessage || 'Cannot Calculate');
      return;
    }

    lastResult = raw;
    resultLabel.textContent = '';
    resultLabel.style.whiteSpace = 'pre-wrap';
    resultNum = el('strong', 'sme-result-number');
    resultNum.textContent = rc.integer
      ? Math.floor(lastResult).toLocaleString('en-US')
      : fmt(lastResult);
    resultLabel.append(`${rc.prefix} `, resultNum, rc.suffix);
  });

  // ── Input behaviour ──
  block.querySelectorAll('.textbox-cal').forEach((inp) => {
    const f = fields.find((x) => x.id === inp.id);
    const decimal = f?.valueType === 'decimal' && !['H', 'C', 'F'].includes(f?.id);
    const isRateField = ['i', 'D', 'G'].includes(f?.id);

    inp.addEventListener('focus', () => {
      if (inp.value === '0' || inp.value === '0.00' || inp.value === '0.000') inp.value = '';
    });

    inp.addEventListener('blur', () => {
      const v = parseFloat(inp.value.replace(/,/g, ''));
      if (!Number.isFinite(v)) {
        if (isRateField) inp.value = '0.000';
        else inp.value = decimal ? '0.00' : '0';
      } else {
        const decPlaces = isRateField ? 3 : 2;
        inp.value = decimal
          ? v.toLocaleString('en-US', { minimumFractionDigits: decPlaces, maximumFractionDigits: decPlaces })
          : Math.round(v).toLocaleString('en-US');
      }
    });

    inp.addEventListener('input', () => {
      inp.classList.remove('input-error');
      if (decimal) {
        touchedDecimalFields.add(f.id);

        let maxBefore = 9;
        let maxAfter = 2;
        if (isRateField) {
          maxBefore = 2;
          maxAfter = 3;
        } else if (f.id === 'H' || f.id === 'C' || f.id === 'F') {
          maxBefore = 6;
        } else if (f.id === 'A') {
          maxBefore = 8;
        } else if (f.id === 'n') {
          maxBefore = 3;
        }

        const parts = inp.value.replace(/,/g, '').split('.');
        if (parts[0].length > maxBefore) parts[0] = parts[0].slice(0, maxBefore);
        if (parts[1] && parts[1].length > maxAfter) parts[1] = parts[1].slice(0, maxAfter);
        const newValue = parts.join('.');

        if (inp.value !== newValue) {
          const pos = inp.selectionStart;
          inp.value = newValue;
          inp.setSelectionRange(pos, pos);
        }
      } else {
        const pos = inp.selectionStart;
        let raw = inp.value.replace(/,/g, '');

        let limit = 9;
        if (f.id === 'n') limit = 3;
        else if (f.id === 'A') limit = 8;
        else if (f.id === 'H' || f.id === 'C' || f.id === 'F') limit = 6;

        if (raw.length > limit) raw = raw.slice(0, limit);
        const num = parseInt(raw, 10);
        if (!Number.isNaN(num)) {
          const formatted = num.toLocaleString('en-US');
          const delta = formatted.length - inp.value.length;
          inp.value = formatted;
          inp.setSelectionRange(pos + delta, pos + delta);
        } else {
          inp.value = '';
        }
      }
    });

    inp.addEventListener('keypress', (e) => {
      const ch = e.key;
      if (ch === 'Enter') { calcBtn.click(); return; }
      if (decimal) {
        if (!/[\d.]/.test(ch)) e.preventDefault();
        if (ch === '.' && inp.value.includes('.')) e.preventDefault();
      } else if (!/\d/.test(ch)) {
        e.preventDefault();
      }
    });
  });

  // ── Add to comparison table ──
  addBtn.addEventListener('click', () => {
    if (lastResult === null) return;
    tableSection.hidden = false;
    const resultCell = rc.integer ? Math.floor(lastResult).toLocaleString('en-US') : fmt(lastResult);
    const fieldValues = tableFields.map((f) => {
      const inp = block.querySelector(`#${f.id}`);
      return inp ? inp.value : '';
    });
    const newRowValues = [resultCell, ...fieldValues];
    const existingRows = [...tbody.querySelectorAll('tr')].map((row) => [...row.children].map((td) => td.textContent.trim()));
    const isDuplicate = existingRows.some((rowValues) => rowValues.length === newRowValues.length
      && rowValues.every((val, idx) => val === newRowValues[idx]));
    if (isDuplicate) return;

    const tr = document.createElement('tr');
    appendTd(tr, resultCell);
    fieldValues.forEach((value) => appendTd(tr, value));
    tbody.appendChild(tr);

    const maxRows = 5;
    while (tbody.children.length > maxRows) tbody.removeChild(tbody.firstElementChild);
  });

  // Reset form, result, and comparison table when switching simple tabs.
  document.addEventListener('click', (e) => {
    const simpleTab = e.target.closest('[data-tab-variant="simple-tab"]');
    if (!simpleTab) return;

    const tabPanel = block.closest('.tab-panel');
    const tabRoot = tabPanel?.parentElement?.parentElement;
    if (!tabRoot?.contains(simpleTab)) return;

    clearFormAndResult();
  }, true);
}
