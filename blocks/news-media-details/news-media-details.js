import { getLang, isAuthoringInstance, fetchBlockAuthoringData } from '../../scripts/bbl-decorators.js';

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

function readFromBlock(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return null;

  const getHtml = (cell) => {
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    stripInstrumentation(clone);
    return clone.innerHTML.trim();
  };
  const getText = (cell) => cell?.textContent?.trim() || '';
  const getRef = (cell) => {
    if (!cell) return { src: '', alt: '' };
    const img = cell.querySelector('img');
    if (img) return { src: img.getAttribute('src') || '', alt: img.alt || '' };
    const a = cell.querySelector('a');
    return { src: a?.getAttribute('href') || cell.textContent.trim(), alt: '' };
  };

  const firstRowCols = rows[0].children.length;

  if (firstRowCols === 2) {
    const cellMap = {};
    rows.forEach((row) => {
      const [keyCell, valCell] = row.children;
      if (!keyCell || !valCell) return;
      const key = keyCell.textContent.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      cellMap[key] = valCell;
    });
    const imgRef = getRef(cellMap.detailimageurl);
    return {
      aboutUsId: getText(cellMap.aboutusid),
      title: getHtml(cellMap.title),
      detailImageUrl: imgRef.src,
      detailImgAlt: imgRef.alt,
      detailDescription: getHtml(cellMap.detaildescription),
      publishDate: getText(cellMap.publishdate),
    };
  }

  if (firstRowCols > 2) {
    const cells = [...rows[0].children];
    const imgRef = getRef(cells[3]);
    return {
      aboutUsId: getText(cells[0]),
      title: getHtml(cells[1]),
      detailImageUrl: imgRef.src,
      detailImgAlt: imgRef.alt,
      detailDescription: getHtml(cells[5]),
      publishDate: getText(cells[7]),
    };
  }

  const imgRef = getRef(rows[3]?.children[0]);
  return {
    aboutUsId: getText(rows[0]?.children[0]),
    title: getHtml(rows[1]?.children[0]),
    detailImageUrl: imgRef.src,
    detailImgAlt: imgRef.alt,
    detailDescription: getHtml(rows[5]?.children[0]),
    publishDate: getText(rows[7]?.children[0]),
  };
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

  const card = readFromBlock(block);

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
