import { loadCSS } from '../../../scripts/aem.js';

const ICON_VARIANTS = ['tiled-tab', 'icon-tab-carousel'];
const CAROUSEL_VARIANTS = ['simple-tab-carousel', 'icon-tab-carousel'];

function createAuthoringButton(tabName, tabVariant, tabIcon, tabIconAlt, index) {
  const button = document.createElement('button');
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
  if (index === 0) button.classList.add('active');

  if (ICON_VARIANTS.includes(tabVariant) && tabIcon) {
    const img = document.createElement('img');
    img.src = tabIcon;
    img.alt = tabIconAlt || '';
    button.appendChild(img);
  }

  button.appendChild(document.createTextNode(tabName));
  return button;
}

function createMediaImages(validTabs) {
  const imagesContainer = document.createElement('div');
  imagesContainer.className = 'tabs-images';

  validTabs.forEach(({ tabIcon, tabIconAlt }, index) => {
    const imageItem = document.createElement('div');
    if (index === 0) imageItem.classList.add('active');
    if (tabIcon) {
      const img = document.createElement('img');
      img.src = tabIcon;
      img.alt = tabIconAlt || '';
      imageItem.appendChild(img);
    }
    imagesContainer.appendChild(imageItem);
  });

  return imagesContainer;
}

function buildCarouselAuthoringNav(validTabs, firstVariant) {
  loadCSS(`${window.hlx.codeBasePath}/blocks/tabs/tabs.css`);

  const tabsWrapper = document.createElement('div');
  tabsWrapper.className = `tabs ${firstVariant}`;

  const carouselNav = document.createElement('div');
  carouselNav.className = 'tabs-authoring-carousel-nav';
  carouselNav.dataset.blockStatus = 'loaded';

  const tabsNav = document.createElement('div');
  tabsNav.className = 'tabs-nav';
  tabsNav.setAttribute('role', 'tablist');

  validTabs.forEach(({
    tabName, tabVariant, tabIcon, tabIconAlt,
  }, index) => {
    tabsNav.appendChild(createAuthoringButton(tabName, tabVariant, tabIcon, tabIconAlt, index));
  });

  const prevBtn = document.createElement('button');
  prevBtn.className = 'tabs-nav-prev icon-arrow-left hidden';
  prevBtn.setAttribute('aria-label', 'Previous tabs');

  const nextBtn = document.createElement('button');
  nextBtn.className = 'tabs-nav-next icon-arrow-left';
  nextBtn.setAttribute('aria-label', 'Next tabs');

  const updateArrows = () => {
    const { scrollLeft, scrollWidth, clientWidth } = tabsNav;
    prevBtn.classList.toggle('hidden', scrollLeft <= 0);
    nextBtn.classList.toggle('hidden', scrollLeft + clientWidth >= scrollWidth - 1);
  };

  prevBtn.addEventListener('click', () => {
    tabsNav.scrollBy({ left: -(tabsNav.clientWidth / 2), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    tabsNav.scrollBy({ left: tabsNav.clientWidth / 2, behavior: 'smooth' });
  });

  tabsNav.addEventListener('scroll', updateArrows);

  carouselNav.appendChild(prevBtn);
  carouselNav.appendChild(tabsNav);
  carouselNav.appendChild(nextBtn);

  tabsWrapper.appendChild(carouselNav);
  validTabs[0].section.insertAdjacentElement('beforebegin', tabsWrapper);
}

export default function buildAuthoringNav(tabGroups) {
  tabGroups.forEach((group) => {
    const validTabs = group.filter((tab) => tab.tabName && tab.tabName.trim() !== '');
    if (validTabs.length === 0) return;

    const firstVariant = validTabs[0].tabVariant;

    if (CAROUSEL_VARIANTS.includes(firstVariant)) {
      buildCarouselAuthoringNav(validTabs, firstVariant);
      return;
    }

    const tabsWrapper = document.createElement('div');
    tabsWrapper.className = `tabs ${firstVariant}`;

    if (firstVariant === 'media-tab') {
      tabsWrapper.appendChild(createMediaImages(validTabs));
    }

    const tabsNavWrapper = document.createElement('div');
    tabsNavWrapper.className = 'tabs';

    const tabsNav = document.createElement('div');
    tabsNav.className = 'tabs-nav';
    tabsNav.setAttribute('role', 'tablist');

    validTabs.forEach(({
      tabName, tabVariant, tabIcon, tabIconAlt,
    }, index) => {
      tabsNav.appendChild(createAuthoringButton(tabName, tabVariant, tabIcon, tabIconAlt, index));
    });

    tabsNavWrapper.appendChild(tabsNav);
    tabsWrapper.appendChild(tabsNavWrapper);
    validTabs[0].section.insertAdjacentElement('beforebegin', tabsWrapper);
  });
}
