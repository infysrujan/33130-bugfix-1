/**
 * Credit Card Application Status Tracking
 *
 * Decorates custom-form panels with stable cc-panel-item-* role classes on inner items.
 * Panel types are identified by authoring cc-app-* classes — not field-* names.
 */

const CC_PANEL_ITEM = 'cc-panel-item';
const CC_APP_PREFIX = 'cc-app-';
const PANEL_SELECTOR = 'fieldset.panel-wrapper.field-wrapper';

const TIMELINE_STATUS_ROLES = [
  'timeline-step',
  'timeline-bg',
  'timeline-status',
  'timeline-message',
  'timeline-caption',
  'timeline-muted',
];

const TIMELINE_STATUS_LAYOUT = {
  roles: [...TIMELINE_STATUS_ROLES, 'panel-action'],
};

const TIMELINE_CALLBACK_LAYOUT = {
  roles: [...TIMELINE_STATUS_ROLES, 'callback-prompt', 'callback-input', 'callback-actions'],
};

const SUBMIT_PANEL_LAYOUT = {
  roles: ['panel-action', 'panel-action-primary'],
};

const BUTTON_PANEL_LAYOUT = {
  roles: ['panel-action-primary', 'panel-action-secondary'],
};

/** @type {Record<string, { roles: string[] }>} */
const PANEL_LAYOUTS = {
  'cc-app-main-form': {
    roles: [
      'form-title',
      'form-input',
      'form-input',
      'form-cover',
      'form-consent',
      'form-actions',
    ],
  },
  'cc-app-approved': {
    roles: [
      'timeline-step',
      'timeline-step',
      'timeline-step',
      'timeline-message',
      'timeline-bg',
      'timeline-date',
      'timeline-caption',
      'panel-action',
    ],
  },
  'cc-app-denied': TIMELINE_STATUS_LAYOUT,
  'cc-app-cancel': TIMELINE_STATUS_LAYOUT,
  'cc-app-pending': TIMELINE_STATUS_LAYOUT,
  'cc-app-incomplete': TIMELINE_STATUS_LAYOUT,
  'cc-app-callback': TIMELINE_CALLBACK_LAYOUT,
  'cc-app-notfound': {
    roles: [
      'timeline-status',
      'timeline-message',
      'timeline-bg',
      'timeline-caption',
    ],
  },
  'cc-app-message-form': {
    roles: [
      'form-title',
      'form-input-half',
      'form-input-half',
      'form-input',
      'form-input',
      'form-radio',
      'form-branch',
      'form-hidden',
      'form-actions',
    ],
  },
  'field-submitbuttonpanel': SUBMIT_PANEL_LAYOUT,
  'field-submitbuttonpanel2': SUBMIT_PANEL_LAYOUT,
  'field-button-panel': BUTTON_PANEL_LAYOUT,
};

const CC_APP_PANEL_SELECTOR = Object.keys(PANEL_LAYOUTS)
  .filter((key) => key.startsWith(CC_APP_PREFIX))
  .map((key) => `fieldset.panel-wrapper.${key}`)
  .join(',');

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isCreditCardTractApplicationForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector(CC_APP_PANEL_SELECTOR) !== null;
}

/**
 * @param {HTMLElement} panel
 * @returns {string | undefined}
 */
function getPanelLayoutKey(panel) {
  return [...panel.classList].find((cls) => PANEL_LAYOUTS[cls]);
}

/**
 * @param {HTMLElement} panel
 * @returns {HTMLElement[]}
 */
function getVisibleDirectItems(panel) {
  return [...panel.children].filter(
    (element) => element.classList?.contains('field-wrapper') && element.dataset.visible !== 'false',
  );
}

/**
 * @param {HTMLElement} element
 * @param {string} role
 * @param {number} [stepIndex]
 */
function applyPanelItemRole(element, role, stepIndex) {
  element.classList.add(CC_PANEL_ITEM, `${CC_PANEL_ITEM}-${role}`);

  if (role === 'timeline-step' && stepIndex != null) {
    element.classList.add(`${CC_PANEL_ITEM}-timeline-step-${stepIndex}`);
  }
}

/**
 * @param {HTMLElement} panel
 */
function decoratePanel(panel) {
  const layoutKey = getPanelLayoutKey(panel);
  if (!layoutKey) return;

  const { roles } = PANEL_LAYOUTS[layoutKey];
  const items = getVisibleDirectItems(panel);
  let timelineStepIndex = 0;

  items.forEach((item, index) => {
    const role = roles[index];
    if (!role) return;

    if (role === 'timeline-step') {
      timelineStepIndex += 1;
      applyPanelItemRole(item, role, timelineStepIndex);
      return;
    }

    applyPanelItemRole(item, role);

    if (item.classList.contains('panel-wrapper') && item.classList.contains('field-wrapper')) {
      decoratePanel(item);
    }
  });
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateCreditCardTractApplication(form) {
  if (!isCreditCardTractApplicationForm(form)) return;

  form.querySelectorAll(PANEL_SELECTOR).forEach(decoratePanel);
}
