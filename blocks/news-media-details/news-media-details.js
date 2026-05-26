import { getLang } from '../../scripts/bbl-decorators.js';
import { fetchConfigs } from '../../scripts/config.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-US' };

function formatDate(dateStr, locale = 'en-US') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

async function fetchNewsCard(url, newsId) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const { news } = await resp.json();
    return news?.find((c) => c.aboutUsId === newsId) || null;
  } catch {
    return null;
  }
}

async function renderNewsDetail(block) {
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-US';

  const params = new URLSearchParams(window.location.search);
  const newsId = params.get('ID') || '';

  const configs = await fetchConfigs();
  const baseUrl = configs?.newsMediaBaseUrl || '';
  const dataUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');

  const card = await fetchNewsCard(dataUrl, newsId);

  if (!card) {
    block.innerHTML = '';
    return;
  }

  const title = card.title
    ? `<div class="news-media-detail-title pad-bot-30">${card.title}</div>`
    : '';
  const date = card.publishDate
    ? `<p class="news-media-detail-date pad-bot-30">${formatDate(card.publishDate, locale)}</p>`
    : '';
  const imageHtml = card.detailImageUrl
    ? `<div class="news-media-detail-image"><img src="${card.detailImageUrl}" alt="${card.title || ''}" loading="lazy"></div>`
    : '';
  const description = card.detailDescription
    ? `<div class="news-media-detail-description">${card.detailDescription}</div>`
    : '';

  block.innerHTML = `
    <div class="news-media-detail-inner">
      <div class="news-media-detail-content">
        ${title}
        ${date}
        ${imageHtml}
        ${description}
      </div>
    </div>`;
}

export default function decorate(block) {
  renderNewsDetail(block);
}
