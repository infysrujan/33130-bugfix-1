/**
 * Custom Dropdown Component
 *
 */

import { subscribe } from '../../rules/index.js';

const OPEN_CLASS = 'is-open';
const ACTIVE_CLASS = 'is-active';
const SELECTED_CLASS = 'is-selected';
const TYPEAHEAD_RESET_MS = 500;

function isSkippable(select) {
  // Multi-select (array-typed) fields keep the native <select multiple> UI;
  // building a custom multi-select listbox is out of scope for this phase.
  return select.multiple;
}

function getOptionEls(listbox) {
  return Array.from(listbox.querySelectorAll('[role="option"]'));
}

function getEnabledOptionEls(listbox) {
  return getOptionEls(listbox).filter((li) => li.getAttribute('aria-disabled') !== 'true');
}

function setActiveOption(listbox, optionEl) {
  getOptionEls(listbox).forEach((li) => li.classList.remove(ACTIVE_CLASS));
  if (optionEl) {
    optionEl.classList.add(ACTIVE_CLASS);
    listbox.setAttribute('aria-activedescendant', optionEl.id);
    optionEl.scrollIntoView({ block: 'nearest' });
  } else {
    listbox.removeAttribute('aria-activedescendant');
  }
}

function getActiveOption(listbox) {
  const id = listbox.getAttribute('aria-activedescendant');
  return id ? listbox.querySelector(`#${CSS.escape(id)}`) : null;
}

function syncTriggerLabel(select, trigger) {
  const label = trigger.querySelector('.custom-dropdown-label');
  const selected = select.options[select.selectedIndex];
  label.textContent = selected ? selected.textContent : '';
  trigger.classList.toggle('is-placeholder', !!(selected && selected.disabled));
}

function syncDisabledState(select, fieldDiv, trigger) {
  const { disabled } = select;
  trigger.toggleAttribute('disabled', disabled);
  trigger.setAttribute('aria-disabled', String(disabled));
  trigger.tabIndex = disabled ? -1 : 0;
  fieldDiv.classList.toggle('field-disabled', disabled);
}

// Associates the field's own <label> (if any) with the trigger via
// aria-labelledby, so the trigger's accessible name matches the visible
// label rather than falling back to its (empty) text content.
function linkLabel(fieldDiv, select, trigger) {
  const labelEl = fieldDiv.querySelector(':scope > .field-label');
  if (!labelEl) return;
  if (!labelEl.id) labelEl.id = `${select.id}-label`;
  trigger.setAttribute('aria-labelledby', labelEl.id);
}

// Consolidates every rule-engine/native-driven field property the trigger
// needs to mirror: disabled, required, invalid/error state and its
// associated description text. Safe to call repeatedly (register, every
// rule-engine change, and after a native form reset).
function syncFieldState(fieldDiv, select, trigger) {
  syncDisabledState(select, fieldDiv, trigger);
  trigger.setAttribute('aria-required', String(!!select.required));
  trigger.setAttribute('aria-invalid', String(fieldDiv.classList.contains('field-invalid')));
  const description = fieldDiv.querySelector(':scope > .field-description');
  if (description) {
    trigger.setAttribute('aria-describedby', description.id);
  } else {
    trigger.removeAttribute('aria-describedby');
  }
  linkLabel(fieldDiv, select, trigger);
}

function createOptionLi(select, opt, index) {
  const li = document.createElement('li');
  li.className = 'custom-dropdown-option';
  li.id = `${select.id}-option-${index}`;
  li.setAttribute('role', 'option');
  li.textContent = opt.textContent;
  li.dataset.value = opt.value;
  if (opt.disabled) {
    li.classList.add('is-placeholder');
    li.setAttribute('aria-disabled', 'true');
  }
  const isSelected = opt.selected && !opt.disabled;
  li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  if (isSelected) {
    li.classList.add(SELECTED_CLASS);
  }
  return li;
}

function createOptgroupLi(select, optgroup, indexRef) {
  const groupLi = document.createElement('li');
  groupLi.className = 'custom-dropdown-group';
  groupLi.setAttribute('role', 'group');
  groupLi.setAttribute('aria-label', optgroup.label);

  const groupLabel = document.createElement('div');
  groupLabel.className = 'custom-dropdown-group-label';
  groupLabel.setAttribute('aria-hidden', 'true');
  groupLabel.textContent = optgroup.label;

  const groupOptions = document.createElement('ul');
  groupOptions.className = 'custom-dropdown-group-options';
  Array.from(optgroup.children).forEach((opt) => {
    groupOptions.append(createOptionLi(select, opt, indexRef.value));
    indexRef.value += 1;
  });

  groupLi.append(groupLabel, groupOptions);
  return groupLi;
}

function renderOptions(select, listbox, trigger) {
  listbox.innerHTML = '';
  const indexRef = { value: 0 };
  Array.from(select.children).forEach((child) => {
    if (child.tagName === 'OPTGROUP') {
      listbox.append(createOptgroupLi(select, child, indexRef));
    } else if (child.tagName === 'OPTION') {
      listbox.append(createOptionLi(select, child, indexRef.value));
      indexRef.value += 1;
    }
  });
  syncTriggerLabel(select, trigger);
}

function closeListbox(trigger, listbox) {
  if (listbox.hidden) return;
  listbox.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.classList.remove(OPEN_CLASS);
  setActiveOption(listbox, null);
}

function openListbox(trigger, listbox, { focusOption } = {}) {
  if (!listbox.hidden) return;
  listbox.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  trigger.classList.add(OPEN_CLASS);
  const enabled = getEnabledOptionEls(listbox);
  const preferred = focusOption
    || enabled.find((li) => li.classList.contains(SELECTED_CLASS))
    || enabled[0]
    || null;
  setActiveOption(listbox, preferred);
  listbox.focus();
}

function selectOption(select, trigger, listbox, optionEl) {
  if (!optionEl || optionEl.getAttribute('aria-disabled') === 'true') return;
  const { value } = optionEl.dataset;
  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  renderOptions(select, listbox, trigger);
  closeListbox(trigger, listbox);
  trigger.focus();
}

function moveActive(listbox, direction) {
  const enabled = getEnabledOptionEls(listbox);
  if (!enabled.length) return;
  const current = getActiveOption(listbox);
  const currentIndex = current ? enabled.indexOf(current) : -1;
  let nextIndex;
  if (direction === 'first') {
    nextIndex = 0;
  } else if (direction === 'last') {
    nextIndex = enabled.length - 1;
  } else if (direction === 'next') {
    nextIndex = Math.min(currentIndex + 1, enabled.length - 1);
  } else {
    nextIndex = Math.max(currentIndex - 1, 0);
  }
  if (currentIndex === -1) nextIndex = direction === 'previous' || direction === 'last' ? enabled.length - 1 : 0;
  setActiveOption(listbox, enabled[nextIndex]);
}

function setupTypeahead(listbox) {
  let searchString = '';
  let lastKeyTime = 0;
  return (key) => {
    const now = Date.now();
    searchString = (now - lastKeyTime > TYPEAHEAD_RESET_MS) ? key : searchString + key;
    lastKeyTime = now;
    const match = getEnabledOptionEls(listbox)
      .find((li) => li.textContent.trim().toLowerCase().startsWith(searchString.toLowerCase()));
    if (match) setActiveOption(listbox, match);
  };
}

export default function decorate(fieldDiv, fd, _container, formId) {
  const select = fieldDiv.querySelector('select');
  if (!select || isSkippable(select)) return fieldDiv;

  // Guards against decorate() ever running twice for the same field (e.g. a
  // stray re-decoration pass) — mappings.js already gates this at the
  // fieldDiv level via dataset.componentStatus, this is a second, local line
  // of defense scoped to this component specifically.
  if (select.dataset.customDropdownInit === 'true') return fieldDiv;
  select.dataset.customDropdownInit = 'true';

  select.classList.add('custom-dropdown-native-select');
  select.setAttribute('aria-hidden', 'true');
  // The native select stays a real, submittable form control, but the
  // visible trigger is the only keyboard/AT entry point — remove it from
  // the Tab sequence (it can still receive focus programmatically).
  select.tabIndex = -1;

  const widget = document.createElement('div');
  widget.className = 'custom-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  trigger.id = `${select.id}-trigger`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.tabIndex = 0;

  const label = document.createElement('span');
  label.className = 'custom-dropdown-label';
  const arrow = document.createElement('span');
  arrow.className = 'custom-dropdown-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  trigger.append(label, arrow);

  const listbox = document.createElement('ul');
  listbox.className = 'custom-dropdown-listbox';
  listbox.id = `${select.id}-listbox`;
  listbox.setAttribute('role', 'listbox');
  listbox.tabIndex = -1;
  listbox.hidden = true;
  trigger.setAttribute('aria-controls', listbox.id);

  widget.append(trigger, listbox);
  select.insertAdjacentElement('afterend', widget);

  if (fd.tooltip) trigger.title = select.title;

  renderOptions(select, listbox, trigger);
  syncFieldState(fieldDiv, select, trigger);

  const optionsObserver = new MutationObserver(() => {
    renderOptions(select, listbox, trigger);
  });
  optionsObserver.observe(select, { childList: true, subtree: true });

  // Programmatic focus (e.g. rule-engine focusing an invalid field, or a stray
  // Tab into the hidden select) should land on the visible trigger instead.
  select.addEventListener('focus', () => trigger.focus());

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    if (listbox.hidden) {
      openListbox(trigger, listbox);
    } else {
      closeListbox(trigger, listbox);
    }
  });

  trigger.addEventListener('keydown', (e) => {
    if (trigger.disabled) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        e.preventDefault();
        openListbox(trigger, listbox);
        break;
      case 'Home':
        e.preventDefault();
        openListbox(trigger, listbox, { focusOption: null });
        moveActive(listbox, 'first');
        break;
      case 'End':
        e.preventDefault();
        openListbox(trigger, listbox, { focusOption: null });
        moveActive(listbox, 'last');
        break;
      default:
        break;
    }
  });

  const typeahead = setupTypeahead(listbox);

  listbox.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(listbox, 'next');
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(listbox, 'previous');
        break;
      case 'Home':
        e.preventDefault();
        moveActive(listbox, 'first');
        break;
      case 'End':
        e.preventDefault();
        moveActive(listbox, 'last');
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectOption(select, trigger, listbox, getActiveOption(listbox));
        break;
      case 'Escape':
        e.preventDefault();
        closeListbox(trigger, listbox);
        trigger.focus();
        break;
      case 'Tab':
        closeListbox(trigger, listbox);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          typeahead(e.key);
        }
        break;
    }
  });

  listbox.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) selectOption(select, trigger, listbox, li);
  });

  // Detached-at-decorate-time gotcha: generateFormRendition() runs every
  // field's decorate() call on a detached fieldDiv *before* appending it to
  // the form (fields render in parallel, then get batch-appended) — so
  // `select.form` is reliably null right here and must not be captured
  // eagerly. Both listeners below are attached to `document` instead (click
  // and reset both bubble), and look up the owning form lazily, once the
  // element is guaranteed to be attached (i.e. once a real event fires).
  function onDocumentClick(e) {
    if (!fieldDiv.isConnected) {
      document.removeEventListener('click', onDocumentClick);
      return;
    }
    if (!widget.contains(e.target)) {
      closeListbox(trigger, listbox);
    }
  }
  document.addEventListener('click', onDocumentClick);

  // Native form.reset() resets the hidden select's value synchronously as
  // its default action, *after* the 'reset' event has been dispatched (and
  // without firing a 'change' event) — defer to the next task so the
  // widget re-reads the select's post-reset state instead of its pre-reset one.
  function onFormReset(e) {
    if (!fieldDiv.isConnected) {
      document.removeEventListener('reset', onFormReset);
      return;
    }
    if (e.target !== select.form) return;
    setTimeout(() => {
      closeListbox(trigger, listbox);
      renderOptions(select, listbox, trigger);
      syncFieldState(fieldDiv, select, trigger);
    }, 0);
  }
  document.addEventListener('reset', onFormReset);

  // Keeps the widget in sync with rule-engine driven changes that bypass real
  // DOM events entirely (direct `.value =` assignment, enum/enumNames rebuilds,
  // enabled/readOnly toggles) — see rules/index.js `fieldChanged`.
  if (formId) {
    subscribe(fieldDiv, formId, (el, model, eventType) => {
      if (eventType === 'register' || eventType === 'change') {
        closeListbox(trigger, listbox);
        renderOptions(select, listbox, trigger);
        syncFieldState(fieldDiv, select, trigger);
      }
    }, { listenChanges: true });
  }

  // Proactive cleanup: the self-checks above only fire on the *next* click or
  // reset anywhere in the document, which is fine for 'click' (near-instant
  // in practice) but could leave 'reset' — and everything it closes over —
  // referenced indefinitely if no further reset ever happens. Watch the whole
  // document for removal instead of the field's form specifically: a rule
  // hiding just this field, a repeatable/wizard step being torn down, and a
  // full form rebuild (createForm() replaces the whole <form> on native
  // reset) all remove nodes from a point *above* where this field used to
  // live, not from within a stable container we could observe directly.
  const removalObserver = new MutationObserver(() => {
    if (!fieldDiv.isConnected) {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('reset', onFormReset);
      optionsObserver.disconnect();
      removalObserver.disconnect();
    }
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });

  return fieldDiv;
}
