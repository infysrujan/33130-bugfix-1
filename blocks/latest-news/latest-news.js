import { loadCSS } from '../../scripts/aem.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { buildCardHtml } from '../../scripts/utils/card-helpers.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-US' };

async function fetchJson(url) {
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    return resp.ok && resp.status !== 204 ? resp.json() : null;
  } catch {
    return null;
  }
}

function formatDate(dateStr, locale = 'en-US') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

async function renderLatestNews(block) {
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  const configs = await fetchConfigs();
  const baseUrl = configs?.newsMediaBaseUrl || '';
  const dataUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');

  const [data, placeholders] = await Promise.all([fetchJson(dataUrl), fetchPlaceholders()]);
  const allNews = data?.news || [];

  const latest = [...allNews]
    .sort((a, b) => {
      const aDate = a.publishDate ? new Date(a.publishDate).getTime() : 0;
      const bDate = b.publishDate ? new Date(b.publishDate).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, parseInt(placeholders.newsMediaTopCount, 10) || 4);

  const grid = document.createElement('div');
  grid.className = 'news-media-grid';

  grid.innerHTML = latest.length
    ? latest.map((c) => {
      const ctaLink = c.ctaLink && c.aboutUsId ? `${c.ctaLink}?ID=${c.aboutUsId}` : (c.ctaLink || '');
      const normalized = { ...c, ctaLink };
      const dateLine = formatDate(c.publishDate, locale);
      return buildCardHtml(normalized, '', placeholders, { dateLine });
    }).join('')
    : `<p class="listing-card-empty">${placeholders.newsMediaNoResults || 'No results found.'}</p>`;

  block.replaceChildren(grid);
}

export default function decorate(block) {
  loadCSS('/styles/components/listing-card.css');
  loadCSS('/blocks/news-media/news-media.css');
  renderLatestNews(block);
}
