import { fetchPlaceholders } from '../../scripts/placeholder.js';

function createAddressCard(location, index, placeholders = {}) {
  const cardWrapper = document.createElement('div');
  cardWrapper.className = 'same-height';

  const card = document.createElement('div');
  card.className = 'pinclick collapse-item thumb-location';
  card.setAttribute('data-lat', location.Lat || '');
  card.setAttribute('data-lng', location.Lng || '');

  // Check if card has info fields (affects header height and table rendering)
  const hasStatus = location.BranchStatus && location.BranchStatus.trim() !== '';
  const hasHours = location.MicroBranchHours && location.MicroBranchHours !== '-';
  const hasTel = location.Tel && location.Tel !== '-' && location.Tel !== 'BeID';
  const hasFax = location.Fax && location.Fax !== '-';
  const hasInfo = hasStatus || hasHours || hasTel || hasFax;

  // Mobile header
  const mobileHeader = document.createElement('div');
  mobileHeader.id = `BoxItemID_${index + 1}`;
  mobileHeader.className = 'header-mobile';
  mobileHeader.innerHTML = `<h3 class="title-3 collapse-head-text">${location.BranchName || ''}</h3>`;

  // Desktop header
  const desktopHeader = document.createElement('div');
  desktopHeader.id = `BoxItemID_${index + 1}`;
  desktopHeader.className = hasInfo ? 'header-desktop header-desktop--compact' : 'header-desktop';

  const title = document.createElement('h3');
  title.className = 'sameHeightHead title-3 collapse-head-text rowIndex1';
  title.textContent = location.BranchName || '';

  // Check if location has valid coordinates
  const hasCoordinates = location.Lat && location.Lng
    && location.Lat !== '-' && location.Lng !== '-'
    && location.Lat !== '' && location.Lng !== '';

  const pinIcon = document.createElement('img');
  pinIcon.id = `BoxItemID_${index + 1}_Pin`;
  pinIcon.src = '/icons/icon_nearme_disable.svg';
  pinIcon.setAttribute('data-lat', location.Lat || '');
  pinIcon.setAttribute('data-lng', location.Lng || '');
  pinIcon.className = 'pinclickImg imgpin-destop';

  // Add disabled styling if no coordinates
  if (!hasCoordinates) {
    pinIcon.classList.add('pin-disabled');
  }

  desktopHeader.appendChild(title);
  desktopHeader.appendChild(pinIcon);

  // Inner content
  const inner = document.createElement('div');
  inner.className = 'collapse-inner';

  // Line separator
  const line = document.createElement('div');
  line.className = 'line';

  // Caption with address
  const caption = document.createElement('div');
  caption.className = 'caption';

  const addressText = document.createElement('p');
  addressText.className = 'text-default content-magin-top fixed-fonts-18';

  // Build address
  const addressParts = [
    location.Address1,
    location.Address2,
    location.Address3,
    location.Province,
    location.Postcode,
  ].filter((part) => part && part !== '-');

  addressText.innerHTML = `<br>${addressParts.join(' ')}`;

  // Hours / Tel / Fax table (shown when any valid value exists)
  if (hasInfo) {
    const infoTable = document.createElement('table');
    infoTable.className = 'info-table';
    const tbody = document.createElement('tbody');

    if (hasStatus) {
      const statusClass = location.BranchStatus.toLowerCase() === 'open' ? 'status-open' : '';
      // Hours in a separate <p> so it doesn't inherit the status color
      const hoursHtml = hasHours ? `<p class="text-default fixed-fonts-16">${location.MicroBranchHours}</p>` : '';
      const row = document.createElement('tr');
      row.innerHTML = `<td class="info-label"><p class="text-default fixed-fonts-16">Status:</p></td><td><p class="text-default fixed-fonts-16 ${statusClass}">${location.BranchStatus}</p>${hoursHtml}</td>`;
      tbody.appendChild(row);
    } else if (hasHours) {
      const row = document.createElement('tr');
      row.innerHTML = `<td class="info-label"><p class="text-default fixed-fonts-18">Hours:</p></td><td><p class="text-default fixed-fonts-18">${location.MicroBranchHours}</p></td>`;
      tbody.appendChild(row);
    }

    if (hasTel) {
      const row = document.createElement('tr');
      row.innerHTML = `<td class="info-label"><p class="text-default fixed-fonts-16">Tel:</p></td><td><p class="text-default fixed-fonts-16">${location.Tel}</p></td>`;
      tbody.appendChild(row);
    }

    if (hasFax) {
      const row = document.createElement('tr');
      row.innerHTML = `<td class="info-label"><p class="text-default fixed-fonts-16">Fax:</p></td><td><p class="text-default fixed-fonts-16">${location.Fax}</p></td>`;
      tbody.appendChild(row);
    }

    infoTable.appendChild(tbody);
    caption.appendChild(infoTable);
  }

  caption.appendChild(addressText);

  // Link box
  const linkBox = document.createElement('div');
  linkBox.className = 'link-box';

  const linkDiv = document.createElement('div');

  // Branch appointment link (if applicable)
  if (location.Branch === 'x' || location.BranchAppointment) {
    const appointmentP = document.createElement('p');
    appointmentP.className = 'content-magin-toppc';

    const appointmentLink = document.createElement('a');
    appointmentLink.className = 'a-content hide-item-p';
    appointmentLink.href = '';
    appointmentLink.target = '_blank';
    appointmentLink.innerHTML = '<img src="/icons/icon_appointment.svg" class="link-icon"> Branch Booking';

    appointmentP.appendChild(appointmentLink);
    linkDiv.appendChild(appointmentP);
  }

  // Get direction link
  const directionP = document.createElement('p');
  directionP.className = 'content-magin-toppc';

  const directionLink = document.createElement('a');
  directionLink.className = 'a-content open-map-icon';
  directionLink.setAttribute('data-lat', location.Lat || '');
  directionLink.setAttribute('data-lng', location.Lng || '');
  directionLink.setAttribute('data-branchname', location.BranchName || '');
  directionLink.setAttribute('data-city', location.Province || '');
  directionLink.innerHTML = '<img src="/icons/icon_route.svg" class="link-icon"> Get Direction';

  // Disable link if no coordinates
  if (!hasCoordinates) {
    directionLink.classList.add('disabled-link');
  }

  directionP.appendChild(directionLink);
  linkDiv.appendChild(directionP);

  linkBox.appendChild(linkDiv);

  // Assemble inner content
  inner.appendChild(line);
  inner.appendChild(caption);
  inner.appendChild(linkBox);

  // Assemble card
  card.appendChild(mobileHeader);
  card.appendChild(desktopHeader);
  card.appendChild(inner);

  // Add card type class if available
  const cardType = location.CardType || '';
  if (cardType) {
    const { cardTypeThailand = '', cardTypeOverseas = '' } = placeholders;
    if (cardTypeThailand && cardType === cardTypeThailand) {
      card.classList.add('card-type-thailand');
    } else if (cardTypeOverseas && cardType === cardTypeOverseas) {
      card.classList.add('card-type-overseas');
    }
  }

  // Add first item badge if first card
  if (index === 0) {
    card.classList.add('active');
    mobileHeader.classList.add('active');
    desktopHeader.classList.add('active');

    const badge = document.createElement('div');
    badge.className = 'first-item';
    badge.textContent = placeholders.nearestLocationTag || 'Nearest';
    card.appendChild(badge);
  }

  // Add click handler for mobile accordion
  mobileHeader.addEventListener('click', () => {
    const isActive = card.classList.contains('active');

    // Only reorder on mobile
    if (window.innerWidth < 768 && !isActive) {
      // Move the clicked card to the top of the container
      const cardParent = cardWrapper.parentElement;
      if (cardParent && cardParent.firstChild !== cardWrapper) {
        cardParent.insertBefore(cardWrapper, cardParent.firstChild);
      }
    }

    // Close all cards
    document.querySelectorAll('.address-card-container .collapse-item').forEach((item) => {
      item.classList.remove('active');
      const mobileHdr = item.querySelector('.header-mobile');
      const desktopHdr = item.querySelector('.header-desktop');

      if (mobileHdr) mobileHdr.classList.remove('active');
      if (desktopHdr) desktopHdr.classList.remove('active');
    });

    // Toggle current card
    if (!isActive) {
      card.classList.add('active');
      mobileHeader.classList.add('active');
      desktopHeader.classList.add('active');

      // Scroll the container to the top on mobile after reordering
      if (window.innerWidth < 768) {
        requestAnimationFrame(() => {
          const containerElement = cardWrapper.parentElement;
          if (containerElement) {
            const containerTop = containerElement.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: containerTop - 20, behavior: 'smooth' });
          }
        });
      }
    }
  });

  // Add click handler for direction link (only if has coordinates)
  if (hasCoordinates) {
    directionLink.addEventListener('click', (e) => {
      e.preventDefault();
      const lat = directionLink.getAttribute('data-lat');
      const lng = directionLink.getAttribute('data-lng');

      if (lat && lng && lat !== '-' && lng !== '-') {
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        window.open(googleMapsUrl, '_blank');
      }
    });
  }

  cardWrapper.appendChild(card);
  return cardWrapper;
}

export default async function decorate(block) {
  // Fetch placeholder values for card type labels and nearest badge
  const placeholders = await fetchPlaceholders();
  const {
    cardTypeThailand = '',
    cardTypeOverseas = '',
    nearestLocationTag = 'Nearest',
    addressCardNoResultsFound = 'No Results Found',
  } = placeholders;
  const rows = [...block.children];
  const addressData = [];

  // Parse the block content
  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length >= 2) {
      const scriptContent = cells[1]?.textContent?.trim();
      if (scriptContent) {
        try {
          const data = JSON.parse(scriptContent);
          if (Array.isArray(data)) {
            addressData.push(...data);
          } else {
            addressData.push(data);
          }
        } catch (e) {
          // Error parsing address data
        }
      }
    }
  });

  // Clear block content
  block.innerHTML = '';

  // Check if there's no data
  if (addressData.length === 0) {
    const noResultsDiv = document.createElement('div');
    noResultsDiv.className = 'text-center no-results';
    noResultsDiv.innerHTML = `<div id="msg-error">${addressCardNoResultsFound}</div>`;
    block.appendChild(noResultsDiv);
    return;
  }

  // Pagination settings
  const cardsPerPage = 12;
  const totalPages = Math.ceil(addressData.length / cardsPerPage);

  // Create main container
  const mainContainer = document.createElement('div');
  mainContainer.className = 'address-card-wrapper';

  // Create container for cards
  const container = document.createElement('section');
  container.className = 'address-card-container row row-center border-work-sheet';
  container.id = 'address-cards-section';

  // Create pagination container
  const paginationContainer = document.createElement('div');
  paginationContainer.className = 'paging jq-pagination';
  paginationContainer.innerHTML = '<ul id="Pagination-Local" class="simple-pagination"></ul>';

  // Function to render pagination
  const renderPagination = (activePage, renderPageFn) => {
    const paginationUl = paginationContainer.querySelector('#Pagination-Local');
    if (!paginationUl) return;

    paginationUl.innerHTML = '';

    if (totalPages <= 1) {
      paginationContainer.classList.add('hidden');
      return;
    }

    paginationContainer.classList.remove('hidden');

    // Previous button
    const prevLi = document.createElement('li');
    if (activePage === 1) {
      prevLi.className = 'disabled';
      prevLi.innerHTML = '<span class="current prev"> </span>';
    } else {
      prevLi.innerHTML = `<a href="#page-${activePage - 1}" class="page-link prev"> </a>`;
      prevLi.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        renderPageFn(activePage - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    paginationUl.appendChild(prevLi);

    // Page numbers
    let i = 1;
    while (i <= totalPages) {
      const pageLi = document.createElement('li');
      const pageNum = i;
      if (pageNum === activePage) {
        pageLi.className = 'active';
        pageLi.innerHTML = `<span class="current">${pageNum}</span>`;
      } else {
        pageLi.innerHTML = `<a href="#page-${pageNum}" class="page-link">${pageNum}</a>`;
        pageLi.querySelector('a').addEventListener('click', (e) => {
          e.preventDefault();
          renderPageFn(pageNum);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
      paginationUl.appendChild(pageLi);
      i += 1;
    }

    // Next button
    const nextLi = document.createElement('li');
    if (activePage === totalPages) {
      nextLi.className = 'disabled';
      nextLi.innerHTML = '<span class="current next"> </span>';
    } else {
      nextLi.innerHTML = `<a href="#page-${activePage + 1}" class="page-link next"> </a>`;
      nextLi.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        renderPageFn(activePage + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    paginationUl.appendChild(nextLi);
  };

  // Function to render cards for current page
  const renderPage = (page) => {
    container.innerHTML = '';
    const startIndex = (page - 1) * cardsPerPage;
    const endIndex = Math.min(startIndex + cardsPerPage, addressData.length);

    let i = startIndex;
    while (i < endIndex) {
      const card = createAddressCard(
        addressData[i],
        i,
        { cardTypeThailand, cardTypeOverseas, nearestLocationTag },
      );
      container.appendChild(card);
      i += 1;
    }

    renderPagination(page, renderPage);
  };

  // Assemble and render initial page
  mainContainer.appendChild(container);
  mainContainer.appendChild(paginationContainer);
  block.appendChild(mainContainer);
  renderPage(1);
}
