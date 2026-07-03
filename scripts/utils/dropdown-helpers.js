const updateDropdown = (root, open) => {
  const trigger = root.querySelector('.global-dropdown-trigger');
  if (!trigger) return;

  root.classList.toggle('is-open', open);
  trigger.setAttribute('aria-expanded', open);

  if (open) {
    const panel = root.querySelector('.global-dropdown-panel');
    if (panel) {
      requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        panel.classList.toggle('panel-flip', rect.right > window.innerWidth);
      });
    }
  }
};

/**
 * Attaches fixed-panel positioning to dropdowns inside a horizontally-scrollable
 * container. Needed because overflow:auto hidden clips position:absolute panels —
 * position:fixed escapes the clip without resetting scrollLeft.
 */
export function attachScrollableDropdownPanel(container, doc) {
  const positionPanel = (dropdown) => {
    if (getComputedStyle(container).overflowX === 'visible') return;
    const trigger = dropdown.querySelector('.global-dropdown-trigger');
    const panel = dropdown.querySelector('.global-dropdown-panel');
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = `${rect.bottom}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.minWidth = '0';
    panel.classList.remove('panel-flip');
    if (rect.left + rect.width > window.innerWidth) {
      panel.style.left = '';
      panel.style.right = `${window.innerWidth - rect.right}px`;
    } else {
      panel.style.left = `${rect.left}px`;
      panel.style.right = '';
    }
  };

  const applyFixedPanel = (dropdown) => requestAnimationFrame(() => positionPanel(dropdown));

  const clearFixedPanel = (dropdown) => {
    const panel = dropdown.querySelector('.global-dropdown-panel');
    if (!panel) return;
    ['position', 'top', 'left', 'right', 'width', 'min-width'].forEach((p) => panel.style.removeProperty(p));
    panel.classList.remove('panel-flip');
  };

  new MutationObserver((mutations) => {
    mutations.forEach(({ target: t }) => {
      if (!t.classList.contains('global-dropdown')) return;
      if (t.classList.contains('is-open')) applyFixedPanel(t);
      else clearFixedPanel(t);
    });
  }).observe(container, { subtree: true, attributes: true, attributeFilter: ['class'] });

  const reposition = () => container.querySelectorAll('.global-dropdown.is-open').forEach(positionPanel);
  container.addEventListener('scroll', reposition);
  doc.addEventListener('scroll', reposition, { passive: true, capture: true });
}

export default function createGlobalDropdown(label = 'Select', linksHTML = '', doc = document) {
  const root = Object.assign(doc.createElement('div'), { className: 'global-dropdown' });

  const trigger = Object.assign(doc.createElement('button'), {
    type: 'button',
    className: 'global-dropdown-trigger icon-dropdown',
    textContent: label,
  });
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'true');

  const panel = Object.assign(doc.createElement('div'), {
    className: 'global-dropdown-panel',
    innerHTML: linksHTML,
  });

  trigger.addEventListener('click', () => updateDropdown(root, !root.classList.contains('is-open')));
  root.addEventListener('keydown', ({ key }) => key === 'Escape' && updateDropdown(root, false));
  doc.addEventListener('click', ({ target }) => !root.contains(target) && updateDropdown(root, false));

  root.append(trigger, panel);
  return root;
}
