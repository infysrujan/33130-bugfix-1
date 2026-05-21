import { moveInstrumentation } from '../../scripts/scripts.js';
import { decorateButtonsV1 } from '../../scripts/bbl-decorators.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';

function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getAssetSrc(cell) {
  return cell?.querySelector('a')?.href
    || cell?.querySelector('img')?.src
    || cell?.textContent?.trim()
    || '';
}

function changeBanner(block) {
  block.addEventListener('mouseenter', (e) => {
    const thumbnail = e.target.closest('.hero-banner-thumbnail-item');
    if (!thumbnail) return;
    const { index } = thumbnail.dataset;
    block.querySelectorAll('[data-index]').forEach((el) => {
      el.classList.toggle('hero-banner-item-active', el.classList.contains('hero-banner-item') && el.dataset.index === index);
      el.classList.toggle('hero-banner-thumbnail-item-active', el.classList.contains('hero-banner-thumbnail-item') && el.dataset.index === index);
    });
  }, true);
}

function lazyLoadThumbnails(block) {
  const outer = block.querySelector('.hero-banner-thumbnail-outer');
  if (!outer) return;
  function onScroll() {
    if (window.scrollY <= 0) return;
    outer.classList.add('hero-banner-thumbnail-outer-active');
    window.removeEventListener('scroll', onScroll);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
}

function stripInstrumentation(el) {
  [...el.querySelectorAll('*'), el].forEach((node) => {
    [...node.attributes]
      .filter(({ nodeName }) => nodeName.startsWith('data-aue-') || nodeName.startsWith('data-richtext-'))
      .forEach(({ nodeName }) => node.removeAttribute(nodeName));
  });
}

function createElement(tag, ...classNames) {
  const el = document.createElement(tag);
  if (classNames.length) el.classList.add(...classNames);
  return el;
}

function createThumbItem(picture, index, { strip = false, active = false } = {}) {
  const item = createElement('li', 'hero-banner-thumbnail-item');
  if (active) item.classList.add('hero-banner-thumbnail-item-active');
  item.dataset.index = index;
  if (picture) {
    if (strip) stripInstrumentation(picture);
    const img = picture.querySelector('img');
    if (img) { img.className = 'hero-banner-thumbnail-img'; img.loading = 'eager'; item.append(img); }
  }
  return item;
}

export default function decorate(block) {
  const isMobile = window.matchMedia('(width <= 47.5rem)').matches;
  const variant = block.children[0]?.textContent?.trim() || 'default';
  const bannerList = createElement('ul', 'hero-banner-list');
  let thumbnailList = '';

  if (variant === 'hero-with-thumbnail-images') {
    thumbnailList = createElement('ul', 'hero-banner-thumbnail-list', 'content');
  }

  const heroRows = [...block.children].slice(1, 7);

  // Pre-pass: find which item has isDefault checked (stored as "true" at children[1])
  let defaultIndex = 0;
  const hasExplicitDefault = heroRows.some((row, i) => {
    if (row.children[1]?.textContent?.trim() === 'true') {
      defaultIndex = i;
      return true;
    }
    return false;
  });
  if (!hasExplicitDefault) defaultIndex = 0;

  heroRows.forEach((row, i) => {
    const bannerItem = createElement('li', 'hero-banner-item');
    if (i === defaultIndex) bannerItem.classList.add('hero-banner-item-active');
    bannerItem.dataset.index = i;

    const mediaType = row.children[0]?.textContent?.trim() || 'images';

    // col 0 = mediaType; isDefault boolean only produces a DOM cell when checked
    let col = 1;
    const possibleIsDefault = row.children[col]?.textContent?.trim();
    if (possibleIsDefault === 'true' || possibleIsDefault === 'false') col += 1;

    // All 5 conditional media cells are always present in the DOM (empty when unused)
    const imageCellDesktop = row.children[col]; col += 1;
    const imageCellMobile = row.children[col]; col += 1;
    const imageAlt = row.children[col]; col += 1;
    const youtubeUrlCell = row.children[col]; col += 1;
    const damVideoCell = row.children[col]; col += 1;

    const logoImageCell = row.children[col]; col += 1;
    const thumbImgCell = row.children[col]; col += 1;
    const preTitleCell = row.children[col]; col += 1;
    const headingCell = row.children[col]; col += 1;
    const textCell = row.children[col]; col += 1;
    const linkCell = row.children[col]; col += 1;

    if (mediaType === 'bg-video') {
      const youtubeUrl = youtubeUrlCell?.querySelector('a')?.href
        || youtubeUrlCell?.textContent?.trim()
        || '';
      const damVideoSrc = getAssetSrc(damVideoCell);

      if (youtubeUrl) {
        const ytId = getYouTubeId(youtubeUrl);
        const iframe = document.createElement('iframe');
        iframe.src = ytId ? `https://www.youtube.com/embed/${ytId}?${isMobile ? '' : 'autoplay=1&'}mute=1&loop=1&playlist=${ytId}` : youtubeUrl;
        iframe.className = 'hero-banner-video';
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        bannerItem.append(iframe);
      } else if (damVideoSrc) {
        const video = document.createElement('video');
        video.className = 'hero-banner-video';
        video.autoplay = !isMobile;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        if (isMobile) video.controls = true;
        const source = document.createElement('source');
        source.src = damVideoSrc;
        source.type = 'video/mp4';
        video.append(source);
        bannerItem.append(video);
      }
    } else {
      const pictureDesktop = imageCellDesktop?.querySelector('picture');
      const pictureMobile = imageCellMobile?.querySelector('picture');

      if (pictureDesktop || pictureMobile) {
        const heroPicture = createSmartImage(pictureDesktop, pictureMobile, imageAlt);
        if (heroPicture) {
          const img = heroPicture.querySelector('img');
          if (img) {
            img.className = 'hero-banner-img';
            img.loading = 'lazy';
          }
          bannerItem.append(heroPicture);
        }
      }
    }

    const contentInner = createElement('div', 'hero-banner-content-inner');
    const logoImg = logoImageCell?.querySelector('img');
    if (logoImg) {
      logoImg.className = 'hero-banner-logo';
      const logoWrapper = createElement('div', 'hero-banner-logo-wrapper');
      logoWrapper.append(logoImg);
      contentInner.append(logoWrapper);
    }

    const contentGroup = createElement('div', 'hero-banner-content-group');
    if (preTitleCell?.firstElementChild) {
      const preTitleEl = preTitleCell.firstElementChild;
      preTitleEl.classList.add('hero-banner-pre-title');
      if (preTitleEl.firstElementChild) preTitleEl.firstElementChild.classList.add('hero-banner-pre-title');
    }
    if (textCell?.firstElementChild) textCell.firstElementChild.classList.add('hero-banner-content-inner-text');
    [preTitleCell, headingCell, textCell, linkCell].forEach((cell) => {
      if (cell) contentGroup.innerHTML += cell.innerHTML;
    });
    decorateButtonsV1(contentGroup);

    contentInner.append(contentGroup);
    const content = createElement('div', 'hero-banner-content', 'content');
    content.append(contentInner);
    bannerItem.append(content);

    if (variant === 'hero-with-thumbnail-images') {
      const thumbPicture = thumbImgCell?.querySelector('picture');
      const cloned = thumbPicture?.cloneNode(true);
      const thumbImg = thumbPicture?.querySelector('img');
      if (thumbImg) {
        thumbImg.className = 'hero-banner-thumbnail-img';
        thumbImg.style.display = 'none';
        thumbImg.setAttribute('aria-hidden', 'true');
        bannerItem.append(thumbImg);
      }
      if (i !== defaultIndex) {
        thumbnailList.append(createThumbItem(cloned, i, { strip: true, active: false }));
      }
    }

    moveInstrumentation(row, bannerItem);
    bannerList.append(bannerItem);
  });

  const mainImgContainer = createElement('div', 'hero-banner-container');
  mainImgContainer.append(bannerList);

  const wrapper = createElement('div', 'hero-banner', `hero-banner-${variant}`);
  wrapper.append(mainImgContainer);

  if (variant === 'hero-with-thumbnail-images') {
    const thumbnailOuter = createElement('div', 'hero-banner-thumbnail-outer');
    thumbnailOuter.append(thumbnailList);
    wrapper.append(thumbnailOuter);
  }

  block.replaceChildren(wrapper);
  changeBanner(block);
  lazyLoadThumbnails(block);
}
