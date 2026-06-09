import { moveInstrumentation } from '../../scripts/scripts.js';

const DEFAULT_BUTTON_TEXT = 'Log on';

/**
 * Parses the block content per _login.json: first row = buttonText + loginPanelTitle,
 * following rows = login-panel-section (loginPanelSubTitle, desktopPanelLinks, mobilePanelLinks).
 * @param {Element} block The login block element
 * @returns {{
 * buttonText: string,
 * loginPanelTitle: string,
 * sections: Array<{ row: Element,
 * subTitle: string,
 * desktopLinksCell: Element,
 * mobileLinksCell: Element }> } | null}
 * Null when block has no children
 */
function parseBlockContent(block) {
  const rows = [...block.children];
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const cells0 = [...firstRow.children];
  const buttonText = cells0[0]?.querySelector('p')?.textContent?.trim()
    || cells0[0]?.textContent?.trim()
    || DEFAULT_BUTTON_TEXT;
  const loginPanelTitle = rows[1]?.querySelector('p')?.textContent?.trim()
    || rows[1]?.textContent?.trim()
    || '';

  const sections = rows.slice(2).map((row) => {
    const cells = [...row.children];
    const subTitle = cells[0]?.querySelector('p')?.textContent?.trim()
      || cells[0]?.textContent?.trim()
      || '';
    return {
      row,
      subTitle,
      desktopLinksCell: cells[1],
      mobileLinksCell: cells[2],
    };
  });

  return { buttonText, loginPanelTitle, sections };
}

/**
 * Creates the login button element (text on desktop, icon on mobile).
 * @param {string} buttonText
 * @returns {HTMLButtonElement}
 */
function createLoginButton(buttonText) {
  const loginButton = document.createElement('button');

  loginButton.className = 'login-button primary icon-login';
  loginButton.setAttribute('aria-expanded', 'false');
  loginButton.setAttribute('aria-haspopup', 'true');
  loginButton.setAttribute('type', 'button');

  const buttonTextSpan = document.createElement('span');
  buttonTextSpan.className = 'login-button-text';
  buttonTextSpan.textContent = buttonText;
  loginButton.appendChild(buttonTextSpan);

  const dropdownIcon = document.createElement('span');
  dropdownIcon.className = 'icon-dropdown';
  dropdownIcon.setAttribute('aria-hidden', 'true');
  loginButton.appendChild(dropdownIcon);

  return loginButton;
}

/**
 * @returns {'ios'|'android'|null}
 */
function getMobileOS() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  return null;
}

/**
 * @param {HTMLLIElement} li
 * @returns {'ios'|'android'|null}
 */
function getOsTagFromLi(li) {
  const text = li.textContent?.toLowerCase() || '';
  if (/#ios\b/.test(text)) return 'ios';
  if (/#android\b/.test(text)) return 'android';
  return null;
}

/**
 * Label text for a list item, excluding nested list content.
 * @param {HTMLLIElement} li
 * @returns {string}
 */
function getLiLabelText(li) {
  const clone = li.cloneNode(true);
  clone.querySelector('ul, ol')?.remove();
  return clone.textContent?.trim() || '';
}

/**
 * @param {HTMLAnchorElement} anchor
 * @param {string} [labelText]
 * @returns {HTMLLIElement}
 */
function createLinkItemFromAnchor(anchor, labelText) {
  const linkItem = document.createElement('li');
  linkItem.className = 'login-link-item';

  const link = document.createElement('a');
  link.href = anchor.href;
  link.className = 'login-link';
  link.textContent = labelText || anchor.textContent?.trim() || '';
  if (anchor.title) link.title = anchor.title;
  linkItem.appendChild(link);

  return linkItem;
}

/**
 * Builds a single link list element from a list of list items.
 * @param {HTMLUListElement|HTMLOListElement} listEl Source list element
 * @param {string} [listClassName] Optional extra class (e.g. for standalone lists, desktop/mobile)
 * @param {{ filterOsLinks?: boolean }} [options]
 * @returns {HTMLUListElement}
 */
function buildLinkList(listEl, listClassName = '', { filterOsLinks = false } = {}) {
  const linkList = document.createElement('ul');
  linkList.className = `login-link-list${listClassName ? ` ${listClassName}` : ''}`;

  const mobileOS = filterOsLinks ? getMobileOS() : null;

  [...listEl.children].forEach((li) => {
    if (li.tagName !== 'LI') return;

    const nestedList = li.querySelector(':scope > ul, :scope > ol');
    if (nestedList) {
      const childItems = [...nestedList.children].filter((child) => child.tagName === 'LI');
      const hasOsTags = filterOsLinks && childItems.some((child) => getOsTagFromLi(child));

      if (hasOsTags) {
        if (!mobileOS) return;

        const matchingChild = childItems.find((child) => getOsTagFromLi(child) === mobileOS);
        const anchor = matchingChild?.querySelector('a');
        if (!anchor) return;

        const labelText = getLiLabelText(li) || anchor.textContent?.trim() || '';
        linkList.appendChild(createLinkItemFromAnchor(anchor, labelText));
        return;
      }

      childItems.forEach((child) => {
        const anchor = child.querySelector('a');
        if (anchor) linkList.appendChild(createLinkItemFromAnchor(anchor));
      });
      return;
    }

    const anchor = li.querySelector('a');
    if (anchor) {
      linkList.appendChild(createLinkItemFromAnchor(anchor));
      return;
    }

    const linkItem = document.createElement('li');
    linkItem.className = 'login-link-item';
    linkItem.textContent = li.textContent?.trim() || '';
    linkList.appendChild(linkItem);
  });

  return linkList;
}

/**
 * Builds a link list from a cell that may contain ul/ol (richtext).
 * @param {Element} [cell] Cell element (e.g. desktopPanelLinks or mobilePanelLinks)
 * @param {string} [listClassName] Optional extra class
 * @param {{ filterOsLinks?: boolean }} [options]
 * @returns {HTMLUListElement|null} Link list or null if no list in cell
 */
function buildLinkListFromCell(cell, listClassName = '', options = {}) {
  if (!cell) return null;
  const listEl = cell.querySelector('ul, ol');
  if (!listEl) return null;
  return buildLinkList(listEl, listClassName, options);
}

/**
 * Builds panel DOM from parsed login data (panel title + sections per _login.json).
 * Preserves authoring instrumentation by moving data-aue-* from each section row to a wrapper.
 * @param {string} loginPanelTitle Title for the login panel (e.g. Online Banking)
 * @param {Array<{ row: Element,
 * subTitle: string,
 * desktopLinksCell: Element,
 * mobileLinksCell: Element }>} sections
 * @returns {HTMLDivElement}
 */
function createLoginPanel(loginPanelTitle, sections) {
  const loginPanel = document.createElement('div');
  loginPanel.className = 'login-panel';
  loginPanel.setAttribute('aria-hidden', 'true');

  const panelInner = document.createElement('div');
  panelInner.className = 'login-panel-inner';

  if (loginPanelTitle) {
    const panelTitleEl = document.createElement('h2');
    panelTitleEl.className = 'login-panel-title';
    panelTitleEl.textContent = loginPanelTitle;
    panelInner.appendChild(panelTitleEl);
  }

  sections.forEach(({
    row, subTitle, desktopLinksCell, mobileLinksCell,
  }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'login-panel-section';
    moveInstrumentation(row, wrapper);

    // const sectionGroup = document.createElement('div');
    // sectionGroup.className = 'login-section';

    if (subTitle) {
      const sectionTitle = document.createElement('h3');
      sectionTitle.className = 'login-section-subtitle';
      sectionTitle.textContent = subTitle;
      wrapper.appendChild(sectionTitle);
    }

    const desktopList = buildLinkListFromCell(desktopLinksCell, 'login-link-list-desktop');
    if (desktopList) wrapper.appendChild(desktopList);

    const mobileList = buildLinkListFromCell(
      mobileLinksCell,
      'login-link-list-mobile',
      { filterOsLinks: true },
    );
    if (mobileList) wrapper.appendChild(mobileList);

    // wrapper.appendChild(sectionGroup);
    panelInner.appendChild(wrapper);
  });

  loginPanel.appendChild(panelInner);
  return loginPanel;
}

function applyLayout(block) {
  let loginContent = block.loginContent || parseBlockContent(block);
  if (!loginContent) return;

  const { buttonText, loginPanelTitle, sections } = loginContent;
  if (!block.loginContent) {
    block.loginContent = {
      buttonText,
      loginPanelTitle,
      sections: sections.map(({ row, subTitle }) => {
        const rowClone = row.cloneNode(true);
        const cells = [...rowClone.children];
        return {
          row: rowClone,
          subTitle,
          desktopLinksCell: cells[1],
          mobileLinksCell: cells[2],
        };
      }),
    };
    loginContent = block.loginContent;
  }

  block.innerHTML = '';

  const loginWrapper = document.createElement('div');
  loginWrapper.className = 'login-wrapper';

  const loginButton = createLoginButton(loginContent.buttonText);
  const loginPanel = createLoginPanel(loginContent.loginPanelTitle, loginContent.sections);
  loginWrapper.appendChild(loginButton);
  loginWrapper.appendChild(loginPanel);

  block.appendChild(loginWrapper);
}

/**
 * Decorates the Login block per _login.json.
 * - Login row: buttonText, loginPanelTitle (panel heading)
 * - Section rows (login-panel-section):
 * loginPanelSubTitle, desktopPanelLinks, mobilePanelLinks
 * Renders a login button and dropdown panel with optional
 * title and sections with desktop/mobile link lists.
 * @param {Element} block The login block element
 */
export default function decorate(block) {
  applyLayout(block);
}
