import { moveInstrumentation } from '../../scripts/scripts.js';
import { createModal, openModal, closeModal } from '../../scripts/modal.js';
import buildThumbSquareList from '../../scripts/utils/thumb-square-list.js';

// ── Survey answers cookie ──────────────────────────────────────────────────────
// All three questionnaire answers are stored as one JSON cookie: mfSurveyAnswers
// { riskLevel: 'low', fxRisk: 'yes', taxBenefit: 'yes' }

const COOKIE_NAME = 'mfSurveyAnswers';

function getSurveyAnswers() {
  try {
    const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`));
    return match ? JSON.parse(decodeURIComponent(match.split('=')[1])) : {};
  } catch { return {}; }
}

function setSurveyAnswer(key, value) {
  try {
    const current = getSurveyAnswers();
    current[key] = value;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(current))};path=/;SameSite=Lax`;
  } catch { /* ignore */ }
}

// ── Row-reading helpers ────────────────────────────────────────────────────────

// Prefer cell[1] (two-column table), fall back to cell[0] (single-column)
function cell(row) {
  return row?.children[1] ?? row?.children[0];
}

function readText(row) {
  const c = cell(row);
  return c?.querySelector('p')?.textContent?.trim() ?? c?.textContent?.trim() ?? '';
}

function readHtml(row) {
  return cell(row)?.innerHTML?.trim() ?? '';
}

function readUrl(row) {
  const anchor = row?.querySelector('a');
  if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
  return cell(row)?.textContent?.trim() ?? '';
}

function readListItems(row) {
  return [...(cell(row)?.querySelectorAll('li') ?? [])].map((li) => li.innerHTML.trim()).filter(Boolean);
}

// Returns { iconEl, label } for each <li> in the risk options row.
// Icon is the decorated <span class="icon ..."> (may have an <img> child after decorateIcons).
function readRiskItems(row) {
  return [...(cell(row)?.querySelectorAll('li') ?? [])].map((li) => {
    const iconEl = li.querySelector('span.icon') ?? null;
    // Label = text content with icon text stripped
    const label = [...li.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join('') || li.textContent.trim();
    return { iconEl, label };
  }).filter(({ label }) => label);
}

// ── Build screen 2 / screen 3 modal content ───────────────────────────────────

function buildYesNoContent({
  title, yesLabel, noLabel, disclaimer, onYes, onNo,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'mfq-screen';

  if (title) {
    const h = document.createElement('h2');
    h.className = 'mfq-title';
    h.textContent = title;
    wrap.appendChild(h);

    const divider = document.createElement('span');
    divider.className = 'mfq-divider';
    divider.setAttribute('aria-hidden', 'true');
    wrap.appendChild(divider);
  }

  const actions = document.createElement('div');
  actions.className = 'mfq-actions';

  const yesBtn = document.createElement('button');
  yesBtn.type = 'button';
  yesBtn.className = 'mfq-btn mfq-btn-yes';
  yesBtn.textContent = yesLabel || 'Yes';
  yesBtn.addEventListener('click', onYes);

  const noBtn = document.createElement('button');
  noBtn.type = 'button';
  noBtn.className = 'mfq-btn mfq-btn-no';
  noBtn.textContent = noLabel || 'No';
  noBtn.addEventListener('click', onNo);

  actions.appendChild(yesBtn);
  actions.appendChild(noBtn);
  wrap.appendChild(actions);

  if (disclaimer) {
    const disc = document.createElement('div');
    disc.className = 'mfq-disclaimer';
    disc.innerHTML = disclaimer;
    wrap.appendChild(disc);
  }

  return wrap;
}

// ── Main export ────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const rows = [...block.children];

  // ── Read authored rows ───────────────────────────────────────────────────
  const screen1FragmentPath = readUrl(rows[1]);
  const cfg = {
    screen1Title: readText(rows[0]),
    screen1FragmentPath: screen1FragmentPath.startsWith('/') ? screen1FragmentPath : '',
    screen1RiskItems: readRiskItems(rows[1]),
    screen1RiskDescriptions: readListItems(rows[2]),
    screen1Description: readHtml(rows[2]),
    screen2Title: readText(rows[3]),
    screen2Yes: readText(rows[4]),
    screen2No: readText(rows[5]),
    screen3Title: readText(rows[6]),
    screen3Yes: readText(rows[7]),
    screen3No: readText(rows[8]),
    disclaimer: readHtml(rows[9]),
    resultsUrl: readUrl(rows[10]),
  };

  // Move UE instrumentation to block, hide source rows
  rows.forEach((row) => moveInstrumentation(row, block));
  rows.forEach((row) => row.classList.add('mfq-source-row'));

  // ── Screen 3 opener ──────────────────────────────────────────────────────
  function openScreen3() {
    const content = buildYesNoContent({
      title: cfg.screen3Title,
      yesLabel: cfg.screen3Yes,
      noLabel: cfg.screen3No,
      disclaimer: cfg.disclaimer,
      onYes: () => {
        setSurveyAnswer('taxBenefit', 'yes');
        closeModal(document);
        if (cfg.resultsUrl) window.location.href = cfg.resultsUrl;
      },
      onNo: () => {
        setSurveyAnswer('taxBenefit', 'no');
        closeModal(document);
        if (cfg.resultsUrl) window.location.href = cfg.resultsUrl;
      },
    });

    // Replace modal body content directly (modal is already open)
    const modalBody = document.querySelector('.custom-modal .modal-body');
    if (modalBody) modalBody.replaceChildren(content);
  }

  // ── Screen 2 opener ──────────────────────────────────────────────────────
  function openScreen2() {
    const content = buildYesNoContent({
      title: cfg.screen2Title,
      yesLabel: cfg.screen2Yes,
      noLabel: cfg.screen2No,
      disclaimer: cfg.disclaimer,
      onYes: () => {
        setSurveyAnswer('fxRisk', 'yes');
        openScreen3();
      },
      onNo: () => {
        setSurveyAnswer('fxRisk', 'no');
        openScreen3();
      },
    });

    const modalBody = document.querySelector('.custom-modal .modal-body');
    if (modalBody) modalBody.replaceChildren(content);
  }

  // ── Build inline risk option cards from authored list items ─────────────
  function buildInlineRiskCards(disclaimer) {
    const wrap = document.createElement('div');
    wrap.className = 'mfq-screen mfq-risk-options';

    const listItems = cfg.screen1RiskItems.map(({ iconEl, label }) => ({
      iconEl,
      label,
      dataset: { riskValue: label.toLowerCase().replace(/\s+/g, '-') },
    }));

    const cardList = buildThumbSquareList(listItems, document);
    wrap.appendChild(cardList);

    // Descriptions as bullet list below the cards, with disclaimer nested inside
    if (cfg.screen1RiskDescriptions.length) {
      const descEl = document.createElement('div');
      descEl.className = 'mfq-description';
      const ul = document.createElement('ul');
      cfg.screen1RiskDescriptions.forEach((desc) => {
        const li = document.createElement('li');
        li.innerHTML = desc;
        ul.appendChild(li);
      });
      descEl.appendChild(ul);
      if (disclaimer) {
        const disc = document.createElement('div');
        disc.className = 'mfq-disclaimer';
        disc.innerHTML = disclaimer;
        descEl.appendChild(disc);
      }
      wrap.appendChild(descEl);
    }

    return wrap;
  }

  // ── Screen 1 opener ──────────────────────────────────────────────────────
  async function openScreen1() {
    if (cfg.screen1FragmentPath) {
      // Load external risk-options fragment into the modal
      await openModal(document, cfg.screen1FragmentPath);
    } else {
      // No external fragment — inject inline risk cards directly into the modal
      const modal = createModal(document);
      const modalBody = modal.querySelector('.modal-body');
      if (modalBody) modalBody.replaceChildren(buildInlineRiskCards(cfg.disclaimer));
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    const modalBody = document.querySelector('.custom-modal .modal-body');
    if (!modalBody) return;

    // Prepend title + divider
    const titleEl = document.createElement('h2');
    titleEl.className = 'mfq-title';
    titleEl.textContent = cfg.screen1Title;

    const divider = document.createElement('span');
    divider.className = 'mfq-divider';
    divider.setAttribute('aria-hidden', 'true');

    modalBody.prepend(divider);
    modalBody.prepend(titleEl);

    // Append description + disclaimer (fragment path variant only)
    // For inline variant, both are already nested inside buildInlineRiskCards()
    if (cfg.screen1FragmentPath) {
      if (cfg.screen1Description) {
        const desc = document.createElement('div');
        desc.className = 'mfq-description';
        desc.innerHTML = cfg.screen1Description;
        if (cfg.disclaimer) {
          const disc = document.createElement('div');
          disc.className = 'mfq-disclaimer';
          disc.innerHTML = cfg.disclaimer;
          desc.appendChild(disc);
        }
        modalBody.appendChild(desc);
      } else if (cfg.disclaimer) {
        const disc = document.createElement('div');
        disc.className = 'mfq-disclaimer';
        disc.innerHTML = cfg.disclaimer;
        modalBody.appendChild(disc);
      }
    }

    // Wire up risk option card clicks — works for both inline cards and fragment cards
    modalBody.addEventListener('click', (e) => {
      const card = e.target.closest('[data-risk-value]');
      if (!card) return;
      e.preventDefault();
      setSurveyAnswer('riskLevel', card.dataset.riskValue);
      openScreen2();
    });
  }

  // ── Expose global API for trigger buttons ────────────────────────────────
  window.mfQuestionnaire = {
    show: openScreen1,
    fragmentPath: cfg.screen1FragmentPath,
  };

  document.addEventListener('mf:open-questionnaire', openScreen1);

  // Auto-show screen 1 when loaded as a modal fragment.
  // block is in a detached <main> at decorate time — observe document.body
  // so we catch the moment replaceChildren moves the block into .modal-body.
  if (!document.body.contains(block)) {
    const observer = new MutationObserver(() => {
      if (block.closest('.modal-body')) {
        observer.disconnect();
        // If user came back from results page via Start Over, auto-open
        const params = new URLSearchParams(window.location.search);
        if (params.get('mf-start-over') === '1') {
          // Clean the URL param without a page reload
          params.delete('mf-start-over');
          const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
          window.history.replaceState(null, '', cleanUrl);
        }
        openScreen1();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } else if (new URLSearchParams(window.location.search).get('mf-start-over') === '1') {
    // Block already in DOM (not a fragment) — open immediately
    const params = new URLSearchParams(window.location.search);
    params.delete('mf-start-over');
    const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', cleanUrl);
    openScreen1();
  }
}
