import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import openPdfViewer from '../../scripts/utils/pdf-viewer.js';
import createTaggedElement from '../../scripts/utils/dom.js';

function getDownloadLabel(mimeType, placeholders = {}) {
  if (mimeType === 'application/pdf') return placeholders.reportsDownloadPdf || 'Download PDF';
  if (mimeType.includes('spreadsheetml') || mimeType.includes('excel')) return placeholders.reportsDownloadExcel || 'Download Excel';
  if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return placeholders.reportsDownloadWord || 'Download Word';
  return placeholders.reportsDownloadFile || 'Download File';
}

function sortAssets(assets, type) {
  return [...assets].sort((a, b) => {
    if (type === 'summary-statement') {
      return parseInt(a.reportMonth, 10) - parseInt(b.reportMonth, 10);
    }
    return parseInt(a.reportQuarter, 10) - parseInt(b.reportQuarter, 10);
  });
}

function buildCard(asset, apiBase, placeholders, googleViewerUrl) {
  const fetchPath = asset.path.startsWith('http') ? asset.path : `${apiBase}${asset.path}`;

  const card = createTaggedElement('div', { className: 'download-section' });

  const titleWrapper = createTaggedElement('div', { className: 'default-content-wrapper' });
  const title = createTaggedElement('h3', { className: 'srr-card-title', text: asset.reportTitle || asset.title });
  const divider = createTaggedElement('div', { className: 'srr-card-divider' });
  titleWrapper.append(title, divider);

  const fileRow = createTaggedElement('div', { className: 'srr-card-file-row' });
  const downloadWrapper = createTaggedElement('div', { className: 'download-button-wrapper' });

  const label = createTaggedElement('span', { className: 'srr-file-label', text: getDownloadLabel(asset.mimeType, placeholders) });

  const iconGroup = createTaggedElement('div', { className: 'srr-icon-group' });

  if (asset.mimeType === 'application/pdf') {
    const previewBtn = createTaggedElement('button', {
      className: 'srr-icon-btn srr-preview-btn',
      attrs: { type: 'button', 'aria-label': `Preview ${asset.name}` },
    });
    previewBtn.append(createTaggedElement('span', { className: 'icon icon-preview', attrs: { 'aria-hidden': 'true' } }));
    previewBtn.addEventListener('click', (e) => { e.stopPropagation(); openPdfViewer({ path: fetchPath, name: asset.name, googleViewerUrl }); });
    iconGroup.append(previewBtn);
  }

  const downloadBtn = createTaggedElement('a', {
    className: 'srr-icon-btn srr-download-btn',
    attrs: {
      href: fetchPath, download: asset.name, 'aria-label': `Download ${asset.name}`, target: '_blank',
    },
  });
  downloadBtn.append(createTaggedElement('span', { className: 'icon icon-download', attrs: { 'aria-hidden': 'true' } }));
  iconGroup.append(downloadBtn);

  downloadWrapper.append(label, iconGroup);
  fileRow.append(downloadWrapper);
  card.append(titleWrapper, fileRow);
  return card;
}

async function fetchAndRender(block, type, year) {
  const lang = getLang();

  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const apiBase = configs.reportsAemBaseUrl || '';
  const googleViewerUrl = configs.reportsGoogleViewerUrl || '';

  block.innerHTML = '';
  const wrapper = createTaggedElement('div', { className: 'srr-results-wrapper' });
  const resultsHeader = createTaggedElement('div', { className: 'srr-header' });
  const backBtn = createTaggedElement('button', {
    className: 'srr-back-btn',
    attrs: { type: 'button', 'aria-label': 'Go back' },
    text: '‹',
  });
  backBtn.addEventListener('click', () => {
    if (typeof window.__previewGoBack === 'function') {
      window.__previewGoBack();
    } else {
      window.history.pushState({}, '', window.location.pathname);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });
  resultsHeader.append(backBtn);
  wrapper.append(resultsHeader);
  wrapper.append(createTaggedElement('h1', { className: 'srr-page-title', text: 'Search Results' }));
  wrapper.append(createTaggedElement('div', { className: 'srr-title-divider' }));
  const loading = createTaggedElement('div', { className: 'srr-loading', text: 'Loading...' });
  wrapper.append(loading);
  block.append(wrapper);

  try {
    const { hostname } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    let data;
    if (isLocal) {
      data = await fetchGet('/blocks/search-reports-results/results.mock.json');
    } else {
      data = await fetchGet(`${apiBase}/${lang}.reports.${type}.${year}.json`, { throwOnError: false });
      if (!data && lang !== 'en') {
        data = await fetchGet(`${apiBase}/en.reports.${type}.${year}.json`, { throwOnError: false });
      }
    }
    if (!data) throw new Error('no content');

    loading.remove();

    if (!data.totalCount || !data.assets?.length) {
      wrapper.append(createTaggedElement('p', { className: 'srr-empty', text: 'No reports found for the selected filters.' }));
      return;
    }

    const sorted = sortAssets(data.assets, type);
    const list = createTaggedElement('div', { className: 'srr-list' });
    sorted.forEach((asset) => list.append(
      buildCard(asset, apiBase, placeholders, googleViewerUrl),
    ));
    wrapper.append(list);
  } catch {
    loading.remove();
    wrapper.append(createTaggedElement('p', { className: 'srr-error', text: 'Unable to load reports. Please try again.' }));
  }
}

export default function decorate(block) {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') || '';
  const year = params.get('year') || '';

  if (type && year) {
    fetchAndRender(block, type, year);
  }

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search);
    if (!p.get('type') && !p.get('year')) block.innerHTML = '';
  });

  window.addEventListener('search-reports:submit', (e) => {
    fetchAndRender(block, e.detail.type, e.detail.year);
  });
}
