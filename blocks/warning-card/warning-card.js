/**
 * Parses a date string, treating timezone-less strings as Bangkok time (UTC+7)
 * @param {string} str - Date string to parse
 * @returns {Date} - Parsed Date object
 */
function parseBangkokDate(str) {
  const trimmed = str.trim();
  // If no timezone info, treat as Bangkok time (UTC+7)
  if (!/[Zz]$/.test(trimmed) && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}+07:00`);
  }
  return new Date(trimmed);
}

/**
 * Checks if current Bangkok time is within the date range
 * @param {string} startDate - Date string for start (treated as Bangkok time if no timezone)
 * @param {string} endDate - Date string for end (treated as Bangkok time if no timezone)
 * @returns {boolean} - True if current time is within range
 */
function isWithinDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return false;
  }

  try {
    const now = new Date();
    const start = parseBangkokDate(startDate);
    const end = parseBangkokDate(endDate);

    return now >= start && now <= end;
  } catch (error) {
    return false;
  }
}

/**
 * Decorates the warning-card block
 * @param {HTMLElement} block - The block element
 */
export default function decorate(block) {
  // Get all rows from the block
  const rows = [...block.children];

  // Parse each row to get the content
  // Row 0: Icon
  const iconRow = rows[0];
  const iconCell = iconRow?.querySelector('div');
  const iconImg = iconCell?.querySelector('img');
  const icon = iconImg?.src || '';
  const iconAlt = 'warning icon';

  const title = rows[1]?.textContent.trim() || '';
  const description = rows[2]?.innerHTML.trim() || '';
  const startDate = rows[3]?.textContent.trim() || '';
  const endDate = rows[4]?.textContent.trim() || '';

  // Check if current time is within the date range (Bangkok timezone)
  if (!isWithinDateRange(startDate, endDate)) {
    block.style.display = 'none';
    return;
  }

  // Clear the block
  block.innerHTML = '';

  // Create inner container wrapper for layout consistency
  const innerContainer = document.createElement('div');
  innerContainer.className = 'warning-card-inner-container';

  // Add icon if present
  if (icon) {
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'warning-card-icon';

    const iconElement = document.createElement('img');
    iconElement.src = icon;
    iconElement.alt = iconAlt;
    iconElement.loading = 'lazy';
    iconWrapper.appendChild(iconElement);

    innerContainer.appendChild(iconWrapper);
  }

  // Create content container
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'warning-card-content';

  // Add title
  if (title) {
    const titleElement = document.createElement('h3');
    titleElement.className = 'warning-card-title';
    titleElement.textContent = title;
    contentWrapper.appendChild(titleElement);
  }

  // Add description
  if (description) {
    const descriptionElement = document.createElement('div');
    descriptionElement.className = 'warning-card-description';
    descriptionElement.innerHTML = description;
    contentWrapper.appendChild(descriptionElement);
  }

  innerContainer.appendChild(contentWrapper);
  block.appendChild(innerContainer);
}
