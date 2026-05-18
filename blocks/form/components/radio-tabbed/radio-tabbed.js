import { moveInstrumentation } from '../../../../scripts/scripts.js';

function activatePanel(block, targetIndex) {
  const labels = block.querySelectorAll('.radio-tabbed-nav label');
  labels.forEach((label, i) => {
    label.classList.toggle('active', i === targetIndex);
    label.setAttribute('aria-selected', i === targetIndex ? 'true' : 'false');
  });

  const panels = block.querySelectorAll('.radio-tabbed-content > div');
  panels.forEach((panel, i) => {
    panel.classList.toggle('active', i === targetIndex);
    panel.setAttribute('aria-hidden', i === targetIndex ? 'false' : 'true');
  });
}

export default function decorate(block) {
  const rows = [...block.children];
  const [labelRow, ...contentRows] = rows;

  // Unique group name so multiple instances on a page don't conflict
  const groupName = `radio-tabbed-${Math.random().toString(36).slice(2, 8)}`;

  const nav = document.createElement('div');
  nav.className = 'radio-tabbed-nav';
  nav.setAttribute('role', 'tablist');

  [...labelRow.children].forEach((cell, index) => {
    const inputId = `${groupName}-${index}`;
    const panelId = `${groupName}-panel-${index}`;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = groupName;
    input.id = inputId;
    input.value = String(index);
    input.setAttribute('aria-controls', panelId);
    if (index === 0) input.checked = true;

    const label = document.createElement('label');
    moveInstrumentation(cell, label);
    label.setAttribute('for', inputId);
    label.setAttribute('role', 'tab');
    label.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    if (index === 0) label.classList.add('active');

    const wrapper = cell.querySelector('div, p');
    const source = wrapper || cell;
    while (source.firstChild) {
      label.appendChild(source.firstChild);
    }

    input.addEventListener('change', () => activatePanel(block, index));

    nav.appendChild(input);
    nav.appendChild(label);
  });

  labelRow.remove();

  const content = document.createElement('div');
  content.className = 'radio-tabbed-content';

  contentRows.forEach((row, index) => {
    const panel = document.createElement('div');
    panel.className = 'radio-tabbed-panel';
    moveInstrumentation(row, panel);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${groupName}-${index}`);
    panel.id = `${groupName}-panel-${index}`;
    panel.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
    if (index === 0) panel.classList.add('active');

    const cell = row.children[0];
    while (cell.firstChild) {
      panel.appendChild(cell.firstChild);
    }

    content.appendChild(panel);
    row.remove();
  });

  block.appendChild(nav);
  block.appendChild(content);

  // Keyboard navigation
  nav.addEventListener('keydown', (e) => {
    const inputs = [...nav.querySelectorAll('input[type="radio"]')];
    const current = inputs.findIndex((inp) => inp.checked);
    if (current === -1) return;

    let next = current;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = current > 0 ? current - 1 : inputs.length - 1;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = current < inputs.length - 1 ? current + 1 : 0;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = inputs.length - 1;
    }

    if (next !== current) {
      inputs[next].checked = true;
      inputs[next].focus();
      activatePanel(block, next);
    }
  });
}
