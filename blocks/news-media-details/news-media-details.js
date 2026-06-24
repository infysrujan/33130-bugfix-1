import { getLang, isAuthoringInstance, fetchBlockAuthoringData } from '../../scripts/bbl-decorators.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-US' };

function formatDate(dateStr, locale = 'en-US') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function stripInstrumentation(el) {
  [el, ...el.querySelectorAll('*')].forEach((node) => {
    [...node.attributes].forEach(({ name }) => {
      if (name.startsWith('data-aue-') || name.startsWith('data-richtext-')) {
        node.removeAttribute(name);
      }
    });
  });
}

function readFromCells(block) {
  const row = block.querySelector(':scope > div');
  if (!row) return null;
  const cells = [...row.children];

  // Field order: aboutUsId, title, cardImageUrl, detailImageUrl,
  //              cardShortDescription, detailDescription, category, publishDate, ...
  const aboutUsId = cells[0]?.textContent?.trim() || '';

  const titleEl = cells[1]?.cloneNode(true);
  const detailImgEl = cells[3]?.cloneNode(true);
  const detailDescEl = cells[5]?.cloneNode(true);

  if (titleEl) stripInstrumentation(titleEl);
  if (detailImgEl) stripInstrumentation(detailImgEl);
  if (detailDescEl) stripInstrumentation(detailDescEl);

  const title = titleEl?.innerHTML?.trim() || '';
  const detailImg = detailImgEl?.querySelector('img');
  const detailImageUrl = detailImg?.getAttribute('src') || '';
  const detailDescription = detailDescEl?.innerHTML?.trim() || '';
  const publishDate = cells[7]?.textContent?.trim() || '';

  return {
    aboutUsId, title, detailImageUrl, detailImgAlt: detailImg?.alt || '', detailDescription, publishDate,
  };
}

async function fetchFromJson(aboutUsId, lang) {
  if (!aboutUsId) return null;
  try {
    const configs = await fetchConfigs();
    const baseUrl = configs?.newsMediaBaseUrl || '';
    const dataUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');
    const json = await fetchGet(dataUrl, { throwOnError: false });
    return json?.news?.find((c) => c.aboutUsId === aboutUsId) || null;
  } catch {
    return null;
  }
}

function buildDetailHtml(card, locale) {
  return `
    <div class="news-media-detail-inner">
      <div class="news-media-detail-content">
        ${card.title ? `<div class="news-media-detail-title pad-bot-30">${card.title}</div>` : ''}
        ${card.publishDate ? `<p class="news-media-detail-date pad-bot-30">${formatDate(card.publishDate, locale)}</p>` : ''}
        ${card.detailImageUrl ? `<div class="news-media-detail-image"><img src="${card.detailImageUrl}" alt="${card.detailImgAlt || ''}" loading="lazy"></div>` : ''}
        ${card.detailDescription ? `<div class="news-media-detail-description">${card.detailDescription}</div>` : ''}
      </div>
    </div>`;
}

async function renderNewsDetail(block) {
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  const isAuthoring = isAuthoringInstance(block);

  let card = readFromCells(block);

  if (card && !card.title && !card.detailDescription && card.aboutUsId) {
    const fetched = await fetchFromJson(card.aboutUsId, lang);
    if (fetched) card = { ...card, ...fetched };
  }

  if (isAuthoring) {
    const authoringData = await fetchBlockAuthoringData('news_media_details');
    const previewData = authoringData || card;

    const originalChildren = [...block.children];

    block.classList.add('has-preview');
    let previewContainer = block.querySelector('.news-media-detail-preview');
    if (!previewContainer) {
      previewContainer = block.ownerDocument.createElement('div');
      previewContainer.className = 'news-media-detail-preview';
      block.appendChild(previewContainer);
    }

    if (previewData && (previewData.title || previewData.detailDescription)) {
      previewContainer.innerHTML = buildDetailHtml(previewData, locale);
    }

    const hidden = block.ownerDocument.createElement('div');
    hidden.style.display = 'none';
    originalChildren.forEach((child) => hidden.appendChild(child));
    block.appendChild(hidden);
    return;
  }

  if (!card || (!card.title && !card.detailDescription)) {
    block.innerHTML = '';
    return;
  }

  block.innerHTML = buildDetailHtml(card, locale);
}

export default function decorate(block) {
  renderNewsDetail(block);
}
