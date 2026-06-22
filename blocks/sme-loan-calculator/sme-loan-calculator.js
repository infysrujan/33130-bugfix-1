import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

export default async function decorate(block) {
  const placeholders = await fetchPlaceholders();

  // ── Helpers (defined first to satisfy no-use-before-define) ──
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function appendTh(row, text) {
    const th = document.createElement('th');
    th.className = 'lineth';
    th.textContent = text;
    row.appendChild(th);
  }

  function appendTd(row, text) {
    const td = document.createElement('td');
    td.className = 'linetd alignc';
    td.textContent = text;
    row.appendChild(td);
  }

  // CSP-safe recursive descent parser — object pattern avoids mutual no-use-before-define
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
          if (this.peek() === ')') {
            this.pos += 1;
          }
          return Math.log(val);
        }
        if (this.peek() === '(') {
          this.pos += 1;
          const val = this.parseExpression();
          if (this.peek() === ')') {
            this.pos += 1;
          }
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

  function formulaCompute(formulaStr, vals) {
    const eqIdx = formulaStr.indexOf('=');
    if (eqIdx === -1) return NaN;

    let expr = formulaStr.slice(eqIdx + 1).trim();

    expr = expr.replace(/\[/g, '(').replace(/\]/g, ')');
    expr = expr.replace(/\bln\s*\(/g, 'Math.log(');
    expr = expr.replace(/\bln([A-Za-z])\b/g, 'Math.log($1)');
    expr = expr.replace(/\s+/g, '');
    expr = expr.replace(/(?<![.\w])([A-Za-z0-9])\(/g, '$1*(');
    expr = expr.replace(/\)\(/g, ')*(');
    expr = expr.replace(/\)([A-Za-z])/g, ')*$1');

    const varSet = new Set(Object.keys(vals));

    expr = expr.replace(/\b([A-Za-z])([A-Za-z])\b/g, (m, a, b) => {
      if (varSet.has(a) && varSet.has(b)) return `${a}*${b}`;
      return m;
    });

    const diff = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
    if (diff > 0) expr += ')'.repeat(diff);

    [...varSet].sort((a, b) => b.length - a.length).forEach((name) => {
      expr = expr.replace(new RegExp(`(?<![\\w.])${name}(?!\\w)`, 'g'), `(${vals[name]})`);
    });

    return evalExpr(expr.replace(/\s+/g, ''));
  }

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
    inp.inputMode = f.valueType === 'decimal' ? 'decimal' : 'numeric';
    inp.value = f.valueType === 'decimal' ? '0.00' : '0';
    if (f.valueType === 'decimal') inp.placeholder = '0.00';
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

  const fields = rows.slice(fieldStart).map((r) => ({
    id: cellText(r, 0),
    label: cellText(r, 1),
    topText: cellText(r, 2),
    bottomText: cellText(r, 3),
    valueType: cellText(r, 4) || 'integer',
  }));

  const ids = fields.map((f) => f.id);
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

  const resultConfig = {
    monthly: { prefix: resultText, suffix: ' baht.', integer: false },
    loanbalance: { prefix: resultText, suffix: ' baht.', integer: false },
    term: { prefix: resultText, suffix: ' month.', integer: true },
    wc: { prefix: resultText, suffix: ' baht.', integer: false },
  };
  const rc = resultConfig[calcType];

  // ── Group fields into rows (max 3 per row, new group on topText) ──
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
  // Hide original rows instead of removing them so UE data-aue-* attributes stay in the DOM
  rows.forEach((r) => { r.style.display = 'none'; });

  const dark = el('div', 'sme-calc-dark-section');

  fieldGroups.forEach((group) => {
    const row = el('div', 'row paddingmain');
    if (group.header) {
      const hdr = el('div', 'fontcontent');
      hdr.textContent = group.header;
      row.appendChild(hdr);
    }
    group.fields.forEach((f) => {
      row.appendChild(buildFieldCard(f));
    });
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

  if (formulaDescription) {
    const fp = el('p', 'sme-calc-formula-description');
    fp.textContent = formulaDescription;
    resultSection.appendChild(fp);
  }

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

  // Comparison table (hidden until first ADD TO TABLE)
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

  const resulttbl = el('div', 'resulttbl');
  const table = el('table', 'tablelong fontcomparetable');
  const thead = document.createElement('thead');

  const hasGroups = fieldGroups.some((g) => g.header && g.fields.length > 1);

  if (hasGroups) {
    const row1 = document.createElement('tr');
    const row2 = document.createElement('tr');

    const resTh = document.createElement('th');
    resTh.className = 'lineth';
    resTh.rowSpan = 2;
    resTh.textContent = resultColHeader[calcType];
    row1.appendChild(resTh);

    fieldGroups.forEach((group) => {
      if (group.header && group.fields.length > 1) {
        const gTh = document.createElement('th');
        gTh.className = 'lineth';
        gTh.colSpan = group.fields.length;
        gTh.textContent = group.header;
        row1.appendChild(gTh);
        group.fields.forEach((f) => {
          const th = document.createElement('th');
          th.className = 'lineth';
          th.textContent = f.label;
          row2.appendChild(th);
        });
      } else {
        group.fields.forEach((f) => {
          const th = document.createElement('th');
          th.className = 'lineth';
          th.rowSpan = 2;
          th.textContent = f.label;
          row1.appendChild(th);
        });
      }
    });
    thead.appendChild(row1);
    thead.appendChild(row2);
  } else {
    const headerRow = document.createElement('tr');
    appendTh(headerRow, resultColHeader[calcType]);
    fields.forEach((f) => appendTh(headerRow, f.label));
    thead.appendChild(headerRow);
  }

  const tbody = el('tbody', 'fontcompareno');
  table.appendChild(thead);
  table.appendChild(tbody);
  resulttbl.appendChild(table);
  tableSection.appendChild(resulttbl);
  block.appendChild(tableSection);

  // ── Calculation ──
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

  const compute = () => {
    const fieldValues = {};
    fields.forEach((f) => {
      fieldValues[f.id] = getVal(f.id);
    });

    if (calcType === 'term') {
      // Formula from config: n = [lnA-ln(A-Pi)]/ln(1+i)
      // A = monthly payment (field P), P = principal (field A), i = annual% / 1200
      const result = formulaCompute(formulaDescription, {
        P: fieldValues.P,
        A: fieldValues.A,
        i: fieldValues.i / 1200,
      });
      return result;
    }

    if (calcType === 'loanbalance') {
      // Formula from config: P = A*((1+i)^n-1)/(i(1+i)^n)
      // i = annual% / 1200
      const result = formulaCompute(formulaDescription, {
        ...fieldValues,
        i: fieldValues.i / 1200,
      });
      return result;
    }

    const result = formulaCompute(formulaDescription, fieldValues);
    return result;
  };

  function validateAndMarkErrors() {
    fields.forEach((f) => {
      block.querySelector(`#${f.id}`)?.classList.remove('input-error');
    });

    let hasError = false;

    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i];
      if (f.valueType !== 'decimal' && getVal(f.id) === 0) {
        block.querySelector(`#${f.id}`)?.classList.add('input-error');
        hasError = true;
        break;
      }
    }

    fields.forEach((f) => {
      if (f.valueType === 'decimal' && getVal(f.id) > 100) {
        block.querySelector(`#${f.id}`)?.classList.add('input-error');
        hasError = true;
      }
    });

    return !hasError;
  }

  calcBtn.addEventListener('click', () => {
    if (!validateAndMarkErrors()) return;
    const raw = compute();
    resultLabel.textContent = '';
    resultLabel.style.whiteSpace = 'pre-wrap';
    resultNum = el('strong', 'sme-result-number');
    if (!Number.isFinite(raw)) {
      resultNum.textContent = errorMessage;
      resultLabel.append(`${rc.prefix} `, resultNum);
      lastResult = null;
    } else {
      lastResult = raw;
      const displayVal = rc.integer
        ? Math.floor(lastResult).toLocaleString('en-US')
        : fmt(lastResult);
      resultNum.textContent = displayVal;
      resultLabel.append(`${rc.prefix} `, resultNum, rc.suffix);
    }
  });

  // ── Input behaviour ──
  block.querySelectorAll('.textbox-cal').forEach((inp) => {
    const f = fields.find((x) => x.id === inp.id);
    const decimal = f?.valueType === 'decimal';

    inp.addEventListener('focus', () => {
      if (inp.value === '0' || inp.value === '0.00') inp.select();
    });

    inp.addEventListener('blur', () => {
      const v = parseFloat(inp.value.replace(/,/g, ''));
      if (!Number.isFinite(v)) {
        inp.value = decimal ? '0.00' : '0';
      } else {
        inp.value = decimal ? v.toFixed(2) : Math.round(v).toLocaleString('en-US');
      }
    });

    inp.addEventListener('input', () => {
      inp.classList.remove('input-error');
      if (!decimal) {
        const pos = inp.selectionStart;
        const raw = inp.value.replace(/,/g, '');
        const num = parseInt(raw, 10);
        if (!Number.isNaN(num)) {
          const formatted = num.toLocaleString('en-US');
          const diff = formatted.length - inp.value.length;
          inp.value = formatted;
          inp.setSelectionRange(pos + diff, pos + diff);
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

  // ── Add to table ──
  addBtn.addEventListener('click', () => {
    if (lastResult === null) return;
    tableSection.hidden = false;
    const tr = document.createElement('tr');
    appendTd(tr, rc.integer ? Math.floor(lastResult).toLocaleString('en-US') : fmt(lastResult));
    fields.forEach((f) => {
      const inp = block.querySelector(`#${f.id}`);
      appendTd(tr, inp ? inp.value : '');
    });
    tbody.appendChild(tr);
  });
}
