const API_BASE = window.location.origin;

const els = {
  serverStatus: document.getElementById('server-status'),
  tabs: [...document.querySelectorAll('.tab')],
  panels: [...document.querySelectorAll('.panel')],
  singleForm: document.getElementById('single-form'),
  singleName: document.getElementById('single-name'),
  singleBase: document.getElementById('single-base'),
  singleDest: document.getElementById('single-dest'),
  singleThreshold: document.getElementById('single-threshold'),
  singleRun: document.getElementById('single-run'),
  csvForm: document.getElementById('csv-form'),
  csvThreshold: document.getElementById('csv-threshold'),
  csvFile: document.getElementById('csv-file'),
  csvFilename: document.getElementById('csv-filename'),
  csvRun: document.getElementById('csv-run'),
  dropzone: document.getElementById('dropzone'),
  browseBtn: document.getElementById('browse-btn'),
  results: document.getElementById('results'),
  tileTotal: document.getElementById('tile-total'),
  tilePassed: document.getElementById('tile-passed'),
  tileFailed: document.getElementById('tile-failed'),
  progressFill: document.getElementById('progress-fill'),
  progressLabel: document.getElementById('progress-label'),
  rows: document.getElementById('rows'),
  errorBanner: document.getElementById('error-banner'),
  viewReportBtn: document.getElementById('view-report-btn'),
  resetBtn: document.getElementById('reset-btn'),
};

let csvContent = null;
let rowElements = new Map(); // pairIndex -> { card, statusIcon, chipGroup, details, chips: Map<label, el> }
let passedCount = 0;
let failedCount = 0;
let totalPairs = 0;
let resultsBaseUrl = '';

// ── Server status ────────────────────────────────────────────────────────────
async function checkServerStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      els.serverStatus.dataset.state = 'up';
      els.serverStatus.querySelector('.label').textContent = 'Server is running';
      return;
    }
    throw new Error('not ok');
  } catch {
    els.serverStatus.dataset.state = 'down';
    els.serverStatus.querySelector('.label').textContent = 'Server not reachable — run "npm run test:visual:server"';
  }
}
checkServerStatus();
setInterval(checkServerStatus, 15000);

// ── Tabs ─────────────────────────────────────────────────────────────────────
els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    els.panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.tab);
    });
  });
});

// ── CSV dropzone ─────────────────────────────────────────────────────────────
function handleCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    csvContent = reader.result;
    els.csvFilename.textContent = `Selected: ${file.name}`;
    els.csvFilename.classList.remove('hidden');
    els.csvRun.disabled = false;
  };
  reader.readAsText(file);
}

els.browseBtn.addEventListener('click', () => els.csvFile.click());
els.csvFile.addEventListener('change', (e) => handleCsvFile(e.target.files[0]));

['dragenter', 'dragover'].forEach((evt) => {
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('dragover');
  });
});
els.dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleCsvFile(file);
});

// ── Results rendering ──────────────────────────────────────────────────────
function resetResults() {
  els.results.classList.add('hidden');
  els.rows.innerHTML = '';
  els.errorBanner.classList.add('hidden');
  els.errorBanner.textContent = '';
  els.viewReportBtn.classList.add('hidden');
  els.resetBtn.classList.add('hidden');
  els.progressFill.style.width = '0%';
  els.progressLabel.textContent = '';
  rowElements = new Map();
  passedCount = 0;
  failedCount = 0;
  totalPairs = 0;
  resultsBaseUrl = '';
}

function setFormsDisabled(disabled) {
  els.singleRun.disabled = disabled;
  els.csvRun.disabled = disabled || !csvContent;
}

function updateSummaryTiles() {
  els.tileTotal.textContent = totalPairs;
  els.tilePassed.textContent = passedCount;
  els.tileFailed.textContent = failedCount;
}

function updateProgress(completed) {
  const pct = totalPairs ? Math.round((completed / totalPairs) * 100) : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressLabel.textContent = `${completed} of ${totalPairs} comparison(s) complete`;
}

function renderPendingRows(pairs) {
  totalPairs = pairs.length;
  updateSummaryTiles();
  updateProgress(0);

  pairs.forEach((pair, index) => {
    const card = document.createElement('div');
    card.className = 'row-card';

    const summary = document.createElement('div');
    summary.className = 'row-summary';

    const icon = document.createElement('span');
    icon.className = 'status-icon pending';
    icon.textContent = '';

    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = pair.name;

    const urls = document.createElement('span');
    urls.className = 'row-urls';
    urls.textContent = `${pair.baseUrl}  →  ${pair.destUrl}`;

    const chipGroup = document.createElement('span');
    chipGroup.className = 'chip-group';

    summary.append(icon, name, urls, chipGroup);

    const details = document.createElement('div');
    details.className = 'row-details';

    summary.addEventListener('click', () => details.classList.toggle('open'));

    card.append(summary, details);
    els.rows.appendChild(card);

    rowElements.set(index, {
      card, icon, chipGroup, details, chips: new Map(),
    });
  });
}

function markRowRunning(pairIndex) {
  const row = rowElements.get(pairIndex);
  if (!row || !row.icon.classList.contains('pending')) return;
  row.icon.className = 'status-icon running';
}

function addViewportChip(pairIndex, viewport) {
  const row = rowElements.get(pairIndex);
  if (!row) return;
  markRowRunning(pairIndex);

  const chip = document.createElement('span');
  chip.className = `chip ${viewport.passed ? 'pass' : 'fail'}`;
  chip.textContent = `${viewport.label} ${(viewport.diffRatio * 100).toFixed(1)}%`;
  row.chipGroup.appendChild(chip);
  row.chips.set(viewport.label, chip);

  const detail = document.createElement('div');
  detail.className = 'viewport-detail';
  detail.innerHTML = `
    <strong>${viewport.label}</strong> — ${viewport.passed ? 'PASS' : 'FAIL'}
    (${(viewport.diffRatio * 100).toFixed(2)}%, ${viewport.diffPixels}/${viewport.totalPixels}px)
    <div class="images">
      <figure><figcaption>Base</figcaption><img loading="lazy" src="${resultsBaseUrl}${viewport.baseImage}" alt="Base" /></figure>
      <figure><figcaption>Destination</figcaption><img loading="lazy" src="${resultsBaseUrl}${viewport.destImage}" alt="Destination" /></figure>
      <figure><figcaption>Diff</figcaption><img loading="lazy" src="${resultsBaseUrl}${viewport.diffImage}" alt="Diff" /></figure>
    </div>`;
  row.details.appendChild(detail);
}

function markRowDone(pairIndex, result) {
  const row = rowElements.get(pairIndex);
  if (!row) return;
  row.icon.className = `status-icon ${result.passed ? 'pass' : 'fail'}`;
  row.icon.textContent = result.passed ? '✓' : '✕';

  if (result.passed) passedCount += 1; else failedCount += 1;
  updateSummaryTiles();

  if (!result.passed) {
    addFixButton(pairIndex, {
      name: result.name,
      baseUrl: result.baseUrl,
      destUrl: result.destUrl,
      viewports: result.viewports,
      resultsBaseUrl,
    });
  }
}

// ── "Fix with Claude" — spawns a restricted, non-interactive Claude Code session on the ──────
// server to investigate the diff and edit the working tree directly (never committed).
function appendFixLog(logEl, text, cls) {
  const line = document.createElement('div');
  line.className = `fix-log-line ${cls || ''}`;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function handleClaudeMessage(logEl, msg) {
  if (msg.type === 'assistant') {
    (msg.message?.content || []).forEach((block) => {
      if (block.type === 'text' && block.text.trim()) {
        appendFixLog(logEl, block.text.trim(), 'text');
      } else if (block.type === 'tool_use') {
        const input = block.input || {};
        const detail = input.file_path || input.pattern || '';
        appendFixLog(logEl, `→ ${block.name}${detail ? `: ${detail}` : ''}`, 'tool');
      }
    });
  } else if (msg.type === 'result') {
    appendFixLog(logEl, msg.result || (msg.is_error ? 'Claude reported an error.' : 'Done.'), msg.is_error ? 'error' : 'final');
    appendFixLog(logEl, `Cost: $${(msg.total_cost_usd || 0).toFixed(4)} · ${msg.num_turns || 0} turn(s)`, 'meta');
  }
}

function addFixButton(pairIndex, pairInfo) {
  const row = rowElements.get(pairIndex);
  if (!row || row.fixStarted) return;
  row.fixStarted = true;

  const fixBtn = document.createElement('button');
  fixBtn.type = 'button';
  fixBtn.className = 'btn btn-fix';
  fixBtn.textContent = 'Fix with Claude';

  const logEl = document.createElement('div');
  logEl.className = 'fix-log hidden';

  fixBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    row.details.classList.add('open');
    logEl.classList.remove('hidden');
    fixBtn.disabled = true;
    fixBtn.textContent = 'Running…';
    appendFixLog(logEl, 'Starting Claude Code (restricted: Read/Edit/Write/Grep/Glob only, no commits)…', 'meta');

    try {
      const res = await fetch(`${API_BASE}/api/url-compare/fix/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pairInfo),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start fix job');

      const source = new EventSource(`${API_BASE}/api/url-compare/fix/jobs/${data.jobId}/stream`);
      let finished = false;

      source.addEventListener('message', (evt) => handleClaudeMessage(logEl, JSON.parse(evt.data)));
      source.addEventListener('log', (evt) => appendFixLog(logEl, JSON.parse(evt.data).line, 'meta'));

      source.addEventListener('exit', (evt) => {
        finished = true;
        const info = JSON.parse(evt.data);
        appendFixLog(logEl, info.code === 0
          ? 'Claude finished — review the changes with git diff before committing.'
          : `Claude process exited with code ${info.code}. ${info.stderr || ''}`, info.code === 0 ? 'meta' : 'error');
        fixBtn.textContent = 'Fix with Claude (again)';
        fixBtn.disabled = false;
        source.close();
      });

      source.addEventListener('error', (evt) => {
        if (finished) return;
        finished = true;
        appendFixLog(logEl, evt.data ? (JSON.parse(evt.data).message || 'Claude fix failed') : 'Lost connection to the fix pipeline', 'error');
        fixBtn.textContent = 'Fix with Claude (again)';
        fixBtn.disabled = false;
        source.close();
      });
    } catch (error) {
      appendFixLog(logEl, error.message, 'error');
      fixBtn.textContent = 'Fix with Claude (again)';
      fixBtn.disabled = false;
    }
  });

  row.card.querySelector('.row-summary').appendChild(fixBtn);
  row.details.appendChild(logEl);
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.classList.remove('hidden');
}

// ── Job runner (shared by single + CSV) ─────────────────────────────────────
async function runJob(payload) {
  resetResults();
  els.results.classList.remove('hidden');
  setFormsDisabled(true);

  let jobRes;
  try {
    const res = await fetch(`${API_BASE}/api/url-compare/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    jobRes = await res.json();
    if (!res.ok) throw new Error(jobRes.error || 'Failed to create comparison job');
  } catch (error) {
    showError(error.message);
    setFormsDisabled(false);
    els.resetBtn.classList.remove('hidden');
    return;
  }

  resultsBaseUrl = jobRes.resultsBaseUrl;
  renderPendingRows(jobRes.pairs);

  const source = new EventSource(`${API_BASE}/api/url-compare/jobs/${jobRes.jobId}/stream`);
  let completedPairs = 0;
  let jobFinished = false;

  source.addEventListener('viewport', (e) => {
    const data = JSON.parse(e.data);
    addViewportChip(data.pairIndex, data.viewport);
  });

  source.addEventListener('pair', (e) => {
    const data = JSON.parse(e.data);
    completedPairs += 1;
    markRowDone(data.pairIndex, data.result);
    updateProgress(completedPairs);
  });

  source.addEventListener('done', (e) => {
    jobFinished = true;
    const data = JSON.parse(e.data);
    updateProgress(totalPairs);
    els.viewReportBtn.href = data.reportUrl;
    els.viewReportBtn.classList.remove('hidden');
    els.resetBtn.classList.remove('hidden');
    setFormsDisabled(false);
    source.close();
  });

  source.addEventListener('error', (e) => {
    // The server closes the stream right after 'done', which makes the browser's
    // EventSource fire a connection-level 'error' too — ignore it once we've already finished.
    if (jobFinished) return;
    jobFinished = true;
    if (e.data) {
      const data = JSON.parse(e.data);
      showError(data.message || 'Comparison failed');
    } else {
      showError('Lost connection to the comparison server');
    }
    els.resetBtn.classList.remove('hidden');
    setFormsDisabled(false);
    source.close();
  });
}

els.singleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const thresholdPct = parseFloat(els.singleThreshold.value);
  runJob({
    rows: [{
      name: els.singleName.value.trim() || 'comparison',
      baseUrl: els.singleBase.value.trim(),
      destUrl: els.singleDest.value.trim(),
      threshold: Number.isNaN(thresholdPct) ? undefined : thresholdPct / 100,
    }],
  });
});

els.csvForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!csvContent) return;
  const thresholdPct = parseFloat(els.csvThreshold.value);
  runJob({
    csvContent,
    threshold: Number.isNaN(thresholdPct) ? undefined : thresholdPct / 100,
  });
});

els.resetBtn.addEventListener('click', () => {
  resetResults();
});
