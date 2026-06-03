import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import {
  getLoginState,
  openPanel,
  closePanel,
  closeOtherLoginPanels,
  closeAllLoginPanels,
} from '../login/login-panel.js';
import { slideUp, slideDown } from '../../scripts/animation.js';
import {
  ensureHeaderNavBackdrop,
  acquireHeaderNavBackdrop,
  releaseHeaderNavBackdrop,
  NAV_BACKDROP_MOBILE,
  NAV_BACKDROP_MEGAMENU,
} from '../../scripts/utils/header-backdrop.js';

// media query match that indicates desktop width
const isDesktop = window.matchMedia('(min-width: 1025px)');

/**
 * Extracts nav blocks from the loaded fragment.
 * @param {DocumentFragment} fragment
 * @returns {{
 *   topNavBlock: Element|null,
 *   brandLogoBlock: Element|null,
 *   mainNavBlocks: NodeListOf<Element>,
 *   loginBlock: Element|null,
 *   locationBlock: Element|null,
 *   searchBlock: Element|null
 * }}
 */
function getNavBlocks(fragment) {
  return {
    topNavBlock: fragment.querySelector('.top-nav'),
    brandLogoBlock: fragment.querySelector('.brand-logo'),
    mainNavBlocks: fragment.querySelectorAll('.main-nav-item'),
    loginBlock: fragment.querySelector('.login'),
    locationBlock: fragment.querySelector('.location'),
    searchBlock: fragment.querySelector('.search'),
  };
}

/**
 * Binds login panel events (button click, backdrop click, Escape, Enter/Space).
 * Call after appending the login block to the header.
 * @param {Element|null} loginBlock
 * The login block element
 * @param {{ closeMegamenu?: () => void }} [options]
 * Desktop only: closes megamenu before opening login
 */
function setupLoginPanelEvents(loginBlock, options = {}) {
  if (!loginBlock) return;
  const { closeMegamenu } = options;
  const wrapper = loginBlock.querySelector('.login-wrapper');
  const state = getLoginState(wrapper);
  if (!state) return;
  const { button } = state;
  const headerNav = loginBlock.closest('.header-nav');

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeOtherLoginPanels(button);

    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      closePanel(state);
    } else {
      if (typeof closeMegamenu === 'function') closeMegamenu();
      openPanel(state);
    }
  });

  if (headerNav) {
    ensureHeaderNavBackdrop(headerNav).addEventListener('click', () => {
      if (button.getAttribute('aria-expanded') === 'true') {
        closePanel(state);
      }
    });
  }

  const keydownHandler = (e) => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      closePanel(state);
      button.focus();
    }
  };
  document.addEventListener('keydown', keydownHandler);
  wrapper.loginKeydownHandler = keydownHandler;

  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      button.click();
    }
  });
}

/**
 * Desktop scroll: hide top-nav when scrolled past, add/remove is-scrolled on main nav.
 * @param {Element|null} topNavBlock
 * @param {HTMLElement} mainNavDesktop
 * @param {() => boolean} getIsNavItemActive
 */
function setupDesktopScrollBehavior(topNavBlock, mainNavDesktop, getIsNavItemActive) {
  let topNavHeight = 0;

  const getTopNavHeight = () => {
    if (topNavBlock) {
      topNavHeight = topNavBlock.getBoundingClientRect().height;
    }
    return topNavHeight;
  };

  setTimeout(getTopNavHeight, 100);

  const handleDesktopScroll = () => {
    const currentScrollY = window.scrollY;
    if (topNavHeight === 0) getTopNavHeight();

    if (currentScrollY >= topNavHeight && topNavHeight > 0) {
      if (topNavBlock) topNavBlock.classList.add('is-hidden');
      mainNavDesktop.classList.add('is-scrolled');
    } else if (!getIsNavItemActive()) {
      if (topNavBlock) topNavBlock.classList.remove('is-hidden');
      mainNavDesktop.classList.remove('is-scrolled');
    }
  };

  window.addEventListener('scroll', handleDesktopScroll, { passive: true });
}

/**
 * Desktop megamenu: toggle is-active on main-nav-items, is-scrolled when open,
 * close on outside click.
 * @param {HTMLElement} mainNavDesktop
 * @param {NodeListOf<Element>} mainNavBlocks
 * @param {Element|null} topNavBlock
 * @param {{ isNavItemActive: boolean }} desktopState
 * @param {HTMLElement} headerNav
 * @returns {() => void} closeMegamenu — idempotent; safe when megamenu already closed
 */
function setupDesktopMegamenuBehavior(
  mainNavDesktop,
  mainNavBlocks,
  topNavBlock,
  desktopState,
  headerNav,
) {
  let topNavHeight = 0;

  const getTopNavHeight = () => {
    if (topNavBlock) {
      topNavHeight = topNavBlock.getBoundingClientRect().height;
    }
    return topNavHeight;
  };

  const closeMegamenu = () => {
    getTopNavHeight();
    mainNavBlocks.forEach((block) => block.classList.remove('is-active'));
    document.querySelectorAll('.main-nav-trigger[aria-expanded="true"]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.closest('.main-nav-item-wrapper')
        ?.querySelector('.megamenu-panel')
        ?.setAttribute('aria-hidden', 'true');
    });
    desktopState.isNavItemActive = false;
    releaseHeaderNavBackdrop(headerNav, NAV_BACKDROP_MEGAMENU);
    if (window.scrollY <= topNavHeight) {
      mainNavDesktop.classList.remove('is-scrolled');
    }
  };

  mainNavBlocks.forEach((navBlock) => {
    navBlock.addEventListener('click', (e) => {
      const megamenuPanel = navBlock.querySelector('.megamenu-panel');
      if (megamenuPanel && megamenuPanel.contains(e.target)) {
        e.stopPropagation();
        return;
      }

      e.stopPropagation();

      closeAllLoginPanels();

      const isAlreadyActive = navBlock.classList.contains('is-active');
      mainNavBlocks.forEach((block) => block.classList.remove('is-active'));

      if (!isAlreadyActive) {
        navBlock.classList.add('is-active');
        desktopState.isNavItemActive = true;
        mainNavDesktop.classList.add('is-scrolled');
        acquireHeaderNavBackdrop(headerNav, NAV_BACKDROP_MEGAMENU);
        slideDown(megamenuPanel, { duration: 1000 });
      } else {
        slideUp(megamenuPanel, { duration: 200, onComplete: () => closeMegamenu() });
      }
    });

    const navTrigger = navBlock.querySelector('.main-nav-trigger');
    const megamenu = navBlock.querySelector('.megamenu-panel');
    const navItem = navBlock.querySelector('.main-nav-item-wrapper');
    // Add event listeners for megamenu interaction
    navTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      const isExpanded = navTrigger.getAttribute('aria-expanded') === 'true';

      document.querySelectorAll('.main-nav-trigger[aria-expanded="true"]').forEach((trigger) => {
        if (trigger !== navTrigger) {
          trigger.setAttribute('aria-expanded', 'false');
          trigger.closest('.main-nav-item-wrapper')
            ?.querySelector('.megamenu-panel')
            ?.setAttribute('aria-hidden', 'true');
        }
      });

      navTrigger.setAttribute('aria-expanded', !isExpanded);
      megamenu.setAttribute('aria-hidden', isExpanded);
    });

    document.addEventListener('click', (e) => {
      if (!navItem.contains(e.target)) {
        navTrigger.setAttribute('aria-expanded', 'false');
        megamenu.setAttribute('aria-hidden', 'true');
      }
    });

    navTrigger.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        navTrigger.setAttribute('aria-expanded', 'false');
        megamenu.setAttribute('aria-hidden', 'true');
        navTrigger.focus();
      }
    });
  });

  mainNavDesktop.addEventListener('click', (e) => {
    const clickedNavItem = e.target.closest('.main-nav-item');
    if (!clickedNavItem && desktopState.isNavItemActive) {
      e.stopPropagation();
    }
  });

  document.addEventListener('click', () => {
    if (desktopState.isNavItemActive) closeMegamenu();
  });

  ensureHeaderNavBackdrop(headerNav).addEventListener('click', () => {
    if (desktopState.isNavItemActive) closeMegamenu();
  });

  return closeMegamenu;
}

/**
 * Wraps each .megamenu-columns with more than 6 columns in a carousel with prev/next arrows.
 * Arrows are enabled only when there is content to scroll on that side.
 * @param {HTMLElement} header
 */
function setupMegamenuColumnsCarousel(header) {
  const columnsContainers = header.querySelectorAll('.megamenu-columns');
  const CAROUSEL_MIN_COLUMNS = 6;

  columnsContainers.forEach((columnsContainer) => {
    const columns = columnsContainer.querySelectorAll(':scope > .megamenu-column');
    if (columns.length <= CAROUSEL_MIN_COLUMNS) return;

    const carousel = document.createElement('div');
    carousel.className = 'megamenu-columns-carousel';

    const arrowPrev = document.createElement('button');
    arrowPrev.type = 'button';
    arrowPrev.className = 'megamenu-carousel-arrow megamenu-carousel-arrow-prev icon-arrow-left is-hidden';
    arrowPrev.setAttribute('aria-label', 'Previous columns');

    const arrowNext = document.createElement('button');
    arrowNext.type = 'button';
    arrowNext.className = 'megamenu-carousel-arrow megamenu-carousel-arrow-next icon-arrow-left';
    arrowNext.setAttribute('aria-label', 'Next columns');

    const track = document.createElement('div');
    track.className = 'megamenu-columns-carousel-track';

    columnsContainer.parentNode.insertBefore(carousel, columnsContainer);
    track.appendChild(columnsContainer);
    carousel.appendChild(arrowPrev);
    carousel.appendChild(track);
    carousel.appendChild(arrowNext);

    function updateArrows() {
      const { scrollLeft } = track;
      const maxScroll = track.scrollWidth - track.clientWidth;
      arrowPrev.classList.toggle('is-hidden', scrollLeft <= 0);
      arrowNext.classList.toggle('is-hidden', maxScroll <= 0 || scrollLeft >= maxScroll - 1);
    }

    arrowPrev.addEventListener('click', () => {
      const firstColumn = columnsContainer.querySelector(':scope > .megamenu-column');
      const step = firstColumn ? firstColumn.offsetWidth + 20 : track.clientWidth * 0.8;
      track.scrollBy({ left: -step, behavior: 'smooth' });
    });

    arrowNext.addEventListener('click', () => {
      const firstColumn = columnsContainer.querySelector(':scope > .megamenu-column');
      const step = firstColumn ? firstColumn.offsetWidth + 20 : track.clientWidth * 0.8;
      track.scrollBy({ left: step, behavior: 'smooth' });
    });

    track.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);

    setTimeout(updateArrows, 0);
  });
}

/**
 * Builds desktop header: top-nav, main-nav (brand + main-nav-items, login, location, search).
 * @param {HTMLElement} header
 * @param {ReturnType<getNavBlocks>} blocks
 */
function buildDesktopLayout(header, blocks) {
  const {
    topNavBlock, brandLogoBlock, mainNavBlocks, loginBlock, locationBlock, searchBlock,
  } = blocks;

  if (topNavBlock) header.appendChild(topNavBlock);

  const mainNavDesktop = document.createElement('div');
  mainNavDesktop.className = 'main-nav-desktop';

  if (brandLogoBlock) mainNavDesktop.appendChild(brandLogoBlock);

  const mainNavRight = document.createElement('div');
  mainNavRight.className = 'main-nav-right';

  mainNavBlocks.forEach((navBlock) => mainNavRight.appendChild(navBlock));
  if (loginBlock) mainNavRight.appendChild(loginBlock);
  if (locationBlock) mainNavRight.appendChild(locationBlock);
  if (searchBlock) mainNavRight.appendChild(searchBlock);

  mainNavDesktop.appendChild(mainNavRight);
  header.appendChild(mainNavDesktop);

  ensureHeaderNavBackdrop(header);

  const desktopState = { isNavItemActive: false };
  setupDesktopScrollBehavior(topNavBlock, mainNavDesktop, () => desktopState.isNavItemActive);
  const closeMegamenu = setupDesktopMegamenuBehavior(
    mainNavDesktop,
    mainNavBlocks,
    topNavBlock,
    desktopState,
    header,
  );
  setupMegamenuColumnsCarousel(header);
  if (loginBlock) setupLoginPanelEvents(loginBlock, { closeMegamenu });
}

/**
 * Mobile scroll: fix mobile-top-bar on top with dark background when user scrolls.
 * @param {HTMLElement} header
 * @param {HTMLElement} mobileTopBar
 */
function setupMobileScrollBehavior(header, mobileTopBar) {
  const applyScrollState = () => {
    if (isDesktop.matches) return;
    const scrolled = window.scrollY > 0;
    if (scrolled) {
      mobileTopBar.classList.add('is-scrolled');
      header.style.paddingTop = `${mobileTopBar.offsetHeight}px`;
    } else {
      mobileTopBar.classList.remove('is-scrolled');
      header.style.paddingTop = '';
    }
  };
  window.addEventListener('scroll', applyScrollState, { passive: true });
  applyScrollState();
}

/**
 * Builds mobile main-nav items (nested lists with back buttons and megamenu content).
 * @param {HTMLElement} mobileNavContent
 * @param {NodeListOf<Element>} mainNavBlocks
 */
let backButtonEventStack = [];

function buildMobileMainNavItems(mobileNavContent, mainNavBlocks, topNavBlock) {
  const backBtn = document.createElement('div');
  backBtn.className = 'mob-megamenu-back-btn';
  backBtn.innerHTML = `
    <span class="icon-arrow-left"></span>
  `;

  mobileNavContent.appendChild(backBtn);

  mainNavBlocks.forEach((navBlock) => {
    mobileNavContent.appendChild(navBlock);

    const triggerButton = navBlock.querySelector('.main-nav-trigger');
    triggerButton.classList.remove('icon-dropdown');
    triggerButton.classList.add('icon-arrow-left');

    triggerButton.addEventListener('click', () => {
      closeAllLoginPanels();
      const menuPanel = navBlock.querySelector('.megamenu-panel');
      menuPanel.classList.add('active');
      backButtonEventStack.push(menuPanel);
      backBtn.classList.add('active');
      if (topNavBlock) topNavBlock.classList.add('is-hidden');
      slideDown(menuPanel, { duration: 700 });
    });

    const menuCategories = navBlock.querySelectorAll('.megamenu-panel .megamenu-inner .megamenu-column .megamenu-category');
    menuCategories.forEach((category) => {
      category.addEventListener('click', () => {
        const menuColumn = category.closest('.megamenu-column');
        menuColumn.classList.add('active');
        backButtonEventStack.push(menuColumn);
        slideDown(menuColumn, { duration: 700 });
      });
    });
  });

  backBtn.addEventListener('click', () => {
    if (backButtonEventStack.length > 0) {
      const lastEvent = backButtonEventStack.pop();

      slideUp(lastEvent, {
        duration: 500,
        onComplete: () => {
          lastEvent.classList.remove('active');
        },
      });
    }
    if (backButtonEventStack.length === 0) {
      backBtn.classList.remove('active');
      if (topNavBlock) topNavBlock.classList.remove('is-hidden');
    }
  });
}

function resetBackButtonEventStack(blocks) {
  const { topNavBlock } = blocks;
  if (topNavBlock) topNavBlock.classList.remove('is-hidden');
  const modBackButton = document.querySelector('.mob-megamenu-back-btn');
  if (modBackButton) modBackButton.classList.remove('active');
  backButtonEventStack.forEach((eventElement) => {
    eventElement.classList.remove('active');
  });
  backButtonEventStack = [];
}

/**
 * Wires hamburger open/close, shared header-backdrop, document click, escape.
 * @param {HTMLElement} headerNav
 * @param {HTMLButtonElement} hamburger
 * @param {HTMLElement} mobileNavMenu
 */
function setupMobileMenuBehavior(headerNav, hamburger, mobileNavMenu, blocks) {
  const closeMobileMenu = () => {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open navigation');
    hamburger.classList.remove('is-hidden');
    mobileNavMenu.setAttribute('aria-hidden', 'true');
    mobileNavMenu.classList.remove('is-open');
    releaseHeaderNavBackdrop(headerNav, NAV_BACKDROP_MOBILE);
  };

  const openMobileMenu = () => {
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Close navigation');
    hamburger.classList.add('is-hidden');
    mobileNavMenu.setAttribute('aria-hidden', 'false');
    mobileNavMenu.classList.add('is-open');
    acquireHeaderNavBackdrop(headerNav, NAV_BACKDROP_MOBILE);
  };

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!mobileNavMenu.classList.contains('is-open')) {
      openMobileMenu();
    }
  });

  ensureHeaderNavBackdrop(headerNav).addEventListener('click', () => {
    if (!mobileNavMenu.classList.contains('is-open')) return;
    closeMobileMenu();
    resetBackButtonEventStack(blocks);
  });

  document.addEventListener('click', (e) => {
    if (mobileNavMenu.classList.contains('is-open')) {
      if (!mobileNavMenu.contains(e.target) && !hamburger.contains(e.target)) {
        closeMobileMenu();
        resetBackButtonEventStack(blocks);
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && mobileNavMenu.classList.contains('is-open')) {
      closeMobileMenu();
      resetBackButtonEventStack(blocks);
    }
  });
}

/**
 * Builds mobile header: top bar (hamburger, brand, login) + nav menu
 * (search, location, main-nav, top-nav) + shared header backdrop.
 * @param {HTMLElement} header
 * @param {ReturnType<getNavBlocks>} blocks
 */
function buildMobileLayout(header, blocks) {
  const {
    topNavBlock, brandLogoBlock, mainNavBlocks, loginBlock, locationBlock, searchBlock,
  } = blocks;

  const mobileTopBar = document.createElement('div');
  mobileTopBar.className = 'mobile-top-bar';

  const hamburger = document.createElement('div');
  hamburger.className = 'hamburger-icon';
  hamburger.setAttribute('aria-label', 'Open navigation');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;
  mobileTopBar.appendChild(hamburger);

  if (brandLogoBlock) {
    brandLogoBlock.classList.add('mobile-brand-logo');
    mobileTopBar.appendChild(brandLogoBlock);
  }

  if (loginBlock) {
    loginBlock.classList.add('mobile-login');
    mobileTopBar.appendChild(loginBlock);
  }

  const mobileNavMenu = document.createElement('div');
  mobileNavMenu.className = 'mobile-nav-menu';
  mobileNavMenu.setAttribute('aria-hidden', 'true');

  const mobileNavContent = document.createElement('div');
  mobileNavContent.className = 'mobile-nav-content';

  const mobileMenuTopRow = document.createElement('div');
  mobileMenuTopRow.className = 'mobile-menu-top-row';
  if (searchBlock) mobileMenuTopRow.appendChild(searchBlock);
  if (locationBlock) mobileMenuTopRow.appendChild(locationBlock);
  mobileNavContent.appendChild(mobileMenuTopRow);

  buildMobileMainNavItems(mobileNavContent, mainNavBlocks, topNavBlock);

  if (topNavBlock) mobileNavContent.appendChild(topNavBlock);

  mobileNavMenu.appendChild(mobileNavContent);

  ensureHeaderNavBackdrop(header);

  header.appendChild(mobileTopBar);
  header.appendChild(mobileNavMenu);

  if (loginBlock) setupLoginPanelEvents(loginBlock);

  setupMobileMenuBehavior(header, hamburger, mobileNavMenu, blocks);
  setupMobileScrollBehavior(header, mobileTopBar);
}

/**
 * Applies desktop or mobile layout to the header using a fresh clone of the nav template.
 * @param {HTMLElement} header
 * @param {DocumentFragment} fragmentTemplate
 * Persistent clone of the nav fragment (unchanged by this call)
 * @param {boolean} desktop
 */
function applyLayout(header, fragmentTemplate, desktop) {
  // Reset body overflow in case we're switching away from mobile with menu open
  document.body.style.overflowY = '';
  delete header.navBackdropReasons;
  delete header.bodyOverflowBeforeNavBackdrop;
  // Remove document keydown listeners from the current layout's login wrappers
  header.querySelectorAll('.login-wrapper').forEach((wrapper) => {
    if (wrapper.loginKeydownHandler) {
      document.removeEventListener('keydown', wrapper.loginKeydownHandler);
      wrapper.loginKeydownHandler = undefined;
    }
  });
  header.innerHTML = '';
  const workingCopy = fragmentTemplate.cloneNode(true);
  const blocks = getNavBlocks(workingCopy);
  if (desktop) {
    buildDesktopLayout(header, blocks);
  } else {
    buildMobileLayout(header, blocks);
  }
}

/**
 * Loads and decorates the header (nav). Delegates to desktop or mobile layout and
 * re-applies layout when the viewport crosses the 1025px breakpoint.
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  if (!fragment) return;

  // Keep a persistent template so we can re-build layout on resize/orientation change
  const fragmentTemplate = fragment.cloneNode(true);

  block.textContent = '';
  const header = document.createElement('div');
  header.className = 'header-nav';

  applyLayout(header, fragmentTemplate, isDesktop.matches);

  block.append(header);

  const main = document.querySelector('main');
  const headerSection = document.querySelector('header');
  const firstMainChild = main?.firstElementChild;
  if (!firstMainChild || !firstMainChild.classList.contains('hero-container')) {
    headerSection.classList.add('is-not-overlapped');
  }

  isDesktop.addEventListener('change', () => {
    applyLayout(header, fragmentTemplate, isDesktop.matches);
  });
}
