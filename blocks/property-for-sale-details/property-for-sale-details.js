import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

function getFileId() {
  return new URLSearchParams(window.location.search).get('FILE_ID') || '';
}

function resolvePhotoSrc(photo) {
  if (!photo) return '';
  if (photo.startsWith('data:')) return photo;
  return `data:image/jpeg;base64,${photo}`;
}

function getPhotos(data) {
  const photos = [];
  for (let i = 1; i <= 20; i += 1) {
    const photo = data[`PHOTO_FILE_${i}`];
    if (!photo) break;
    photos.push(photo);
  }
  return photos;
}

function buildCarousel(photos, data, p) {
  const videoId = (data?.WEBSITE_REMARK || '').trim();
  const hasVideo = !!videoId;

  if (!photos.length && !hasVideo) return '';

  const slideItems = [];

  if (hasVideo) {
    const youtubeBase = (p.propertyForSaleYoutubeBaseUrl || 'https://www.youtube.com/embed').trim();
    slideItems.push({
      type: 'video',
      html: `<div class="prop-for-sale-slide prop-for-sale-slide-video is-active">
        <iframe
          src="${youtubeBase}/${encodeURIComponent(videoId)}?autoplay=1&mute=1&rel=0&modestbranding=1"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
          title="Property Video"
        ></iframe>
      </div>`,
    });
  }

  photos.forEach((photo, i) => {
    const isActive = !hasVideo && i === 0;
    slideItems.push({
      type: 'photo',
      html: `<div class="prop-for-sale-slide${isActive ? ' is-active' : ''}">
        <img src="${resolvePhotoSrc(photo)}" alt="" class="prop-for-sale-slide-img" loading="lazy">
      </div>`,
    });
  });

  const slides = slideItems.map((s) => s.html).join('');
  const totalSlides = slideItems.length;

  const dots = totalSlides > 1
    ? slideItems.map((_, i) => `<li class="prop-for-sale-dot${i === 0 ? ' is-active' : ''}"><button data-index="${i}" aria-label="Slide ${i + 1}"></button></li>`).join('')
    : '';

  const nav = totalSlides > 1 ? `
    <button class="prop-for-sale-nav prop-for-sale-nav-prev" aria-label="Previous"><i class="icon-arrow-left" aria-hidden="true"></i></button>
    <button class="prop-for-sale-nav prop-for-sale-nav-next" aria-label="Next"><i class="icon-arrow-left" aria-hidden="true"></i></button>` : '';

  return `<div class="prop-for-sale-carousel" ${hasVideo ? 'data-has-video="true"' : ''}>
    <div class="prop-for-sale-slides">${slides}</div>
    ${nav}
    ${dots ? `<ul class="prop-for-sale-dots">${dots}</ul>` : ''}
  </div>`;
}

function formatPrice(price) {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatArea(data) {
  return `${data.AREA_RAI ?? 0}-${data.AREA_QUARTER ?? 0}-${data.AREA_SQUARE_WAH ?? 0}-${data.AREA_SQUARE_METER ?? 0}`;
}

function buildLocation(data) {
  const parts = [
    data.HOUSE_NO ? `บ้านเลขที่ ${data.HOUSE_NO}` : '',
    data.VILLAGE_NO ? `หมู่ที่ ${data.VILLAGE_NO}` : '',
    data.LOCATION_ROAD && data.LOCATION_ROAD !== '-' ? `ถนน ${data.LOCATION_ROAD}` : '',
    data.LOCATION_TAMBON ? `ตำบล ${data.LOCATION_TAMBON}` : '',
    data.LOCATION_AMPHUR ? `อำเภอ ${data.LOCATION_AMPHUR}` : '',
    data.LOCATION_PROVINCE ? `จังหวัด ${data.LOCATION_PROVINCE}` : '',
  ].filter(Boolean);
  return parts.join(' ') || '-';
}

function buildMapLink(data, label, mapBaseUrl) {
  const lat = data.GPS_LATITUDE;
  const lng = data.GPS_LONGTITUDE;
  if (!lat || !lng || !mapBaseUrl) return '-';
  const href = `${mapBaseUrl}N ${lat} E ${lng}`;
  return `<a href="${href}" target="_blank" class="prop-for-sale-map-link">${label}<img src="/icons/google-map-open.ico" alt="" class="prop-for-sale-map-icon"></a>`;
}

function getFieldValue(field, data, currency, openMapLabel, mapBaseUrl) {
  switch (field) {
    case 'FILE_ID': return data.FILE_ID ? `${data.FILE_ID}${data.OLD_FILE_ID ? ` หรือ ${data.OLD_FILE_ID}` : ''}` : '-';
    case 'AREA': return formatArea(data);
    case 'LOCATION': return buildLocation(data);
    case 'PR_PRICE': return data.PR_PRICE ? `${formatPrice(data.PR_PRICE)} ${currency}` : '-';
    case 'SPECIAL_PRICE': return data.SPECIAL_PRICE ? `${formatPrice(data.SPECIAL_PRICE)} ${currency}` : '-';
    case 'MAP': return buildMapLink(data, openMapLabel, mapBaseUrl);
    default: return data[field] || '-';
  }
}

function buildDetailHtml(data, placeholders, detailRows, mapBaseUrl) {
  const p = placeholders;
  const currency = p.propertyForSaleCurrency || 'บาท';
  const openMapLabel = p.propertyForSaleOpenMap || 'เปิด google map';

  const rows = detailRows.map(({ Label: label, Field: field }) => ({
    label,
    value: getFieldValue(field, data, currency, openMapLabel, mapBaseUrl),
    special: field === 'SPECIAL_PRICE',
    starting: field === 'PR_PRICE',
  }));

  const rowsHtml = rows.map(({
    label, value, special, starting,
  }) => {
    const cls = `prop-for-sale-value${special ? ' prop-for-sale-special-price' : ''}${starting ? ' prop-for-sale-starting-price' : ''}`;
    return `
    <div class="prop-for-sale-row">
      <div class="prop-for-sale-label">${label}</div>
      <div class="${cls}">${value}</div>
    </div>`;
  }).join('');

  const contactParts = [
    data.PORT_TEAM_NAME,
    data.SAM_TEAM_NAME,
  ].filter(Boolean).join(' , ');

  const contactBody = [
    contactParts ? `<p class="prop-for-sale-contact-name">${contactParts}</p>` : '',
    data.WEB_TELEPHONE ? `<p class="prop-for-sale-contact-tel">${p.propertyForSalePhone || 'โทรศัพท์'}: ${data.WEB_TELEPHONE.trim()}</p>` : '',
    data.WEB_EMAIL ? `<p class="prop-for-sale-contact-email">${p.propertyForSaleEmail || 'อีเมล'}: ${data.WEB_EMAIL.trim()}</p>` : '',
  ].filter(Boolean).join('');

  const contactHtml = contactBody ? `
    <div class="prop-for-sale-contact-title-wrapper">
      <h3 class="prop-for-sale-contact-title">${p.propertyForSaleContactTitle || 'การติดต่อ'}</h3>
    </div>
    <div class="prop-for-sale-contact-body">${contactBody}</div>` : '';

  return `<div class="prop-for-sale-grid">${rowsHtml}</div>${contactHtml}`;
}

function initCarousel(block, interval) {
  const slides = [...block.querySelectorAll('.prop-for-sale-slide')];
  const dots = [...block.querySelectorAll('.prop-for-sale-dot')];
  if (slides.length <= 1) return;
  const hasVideo = !!block.querySelector('.prop-for-sale-carousel[data-has-video]');

  let current = 0;
  let autoTimer;

  function goTo(idx, direction = 1) {
    slides[current].classList.remove('is-active', 'from-left');
    dots[current]?.classList.remove('is-active');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.toggle('from-left', direction < 0);
    slides[current].classList.add('is-active');
    dots[current]?.classList.add('is-active');
  }

  function startAuto() {
    if (hasVideo) return;
    clearInterval(autoTimer);
    autoTimer = setInterval(() => goTo(current + 1, 1), interval);
  }

  block.querySelector('.prop-for-sale-nav-prev')?.addEventListener('click', () => { goTo(current - 1, -1); startAuto(); });
  block.querySelector('.prop-for-sale-nav-next')?.addEventListener('click', () => { goTo(current + 1, 1); startAuto(); });
  dots.forEach((dot, i) => dot.querySelector('button')?.addEventListener('click', () => { goTo(i, 1); startAuto(); }));

  const slidesEl = block.querySelector('.prop-for-sale-slides');
  let dragStartX = 0;
  let isDragging = false;

  function onDragStart(x) { dragStartX = x; isDragging = true; }
  function onDragEnd(x) {
    if (!isDragging) return;
    isDragging = false;
    const diff = dragStartX - x;
    if (Math.abs(diff) > 50) {
      const dir = diff > 0 ? 1 : -1;
      goTo(current + dir, dir);
      startAuto();
    }
  }

  slidesEl.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientX), { passive: true });
  slidesEl.addEventListener('touchend', (e) => onDragEnd(e.changedTouches[0].clientX));
  slidesEl.addEventListener('mousedown', (e) => onDragStart(e.clientX));
  slidesEl.addEventListener('mouseup', (e) => onDragEnd(e.clientX));

  startAuto();
}

export default async function decorate(block) {
  const fileId = getFileId();
  if (!fileId) {
    block.innerHTML = '';
    return;
  }

  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const apiBase = (configs?.propertyForSaleBaseUrl || '').replace(/\/$/, '');
  const pfsConfigUrl = configs?.propertyForSaleConfigUrl || '';
  const mapBaseUrl = configs?.propertyForSaleMapUrl || '';

  const [resp, configJson] = await Promise.all([
    fetchGet(`${apiBase}/GetPropertyDetail/${fileId}`, {
      headers: { Accept: 'application/json' },
      throwOnError: false,
    }).catch(() => null),
    fetchGet(pfsConfigUrl, { throwOnError: false }).catch(() => null),
  ]);

  const detailRows = (configJson?.['detail-page-rows']?.data || []).filter((r) => r.Label && r.Field);
  const carouselInterval = parseInt(placeholders.propertyForSaleCarouselInterval, 10) || 10000;

  const data = Array.isArray(resp) ? resp[0] : resp;

  if (!data) {
    block.innerHTML = `<p class="prop-for-sale-error">${placeholders.propertyForSaleNotFound || 'ไม่พบข้อมูลทรัพย์สิน'}</p>`;
    return;
  }

  const photos = getPhotos(data);

  block.innerHTML = `
    ${buildCarousel(photos, data, placeholders)}
    <div class="prop-for-sale-detail">${buildDetailHtml(data, placeholders, detailRows, mapBaseUrl)}</div>`;

  initCarousel(block, carouselInterval);
}
