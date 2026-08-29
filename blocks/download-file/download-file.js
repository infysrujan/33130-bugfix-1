import createDownloadLink from '../../scripts/utils/download-helpers.js';

export default function decorate(block) {
  const rows = [...block.children];
  const [row] = rows;
  if (!row) return;
  const datePrefix = rows[1]?.textContent.trim();
  const button = createDownloadLink(row);
  if (button && datePrefix) {
    const link = button.querySelector('a');
    const dateSpan = document.createElement('span');
    dateSpan.className = 'download-date-prefix';
    dateSpan.textContent = datePrefix;
    link?.prepend(dateSpan);
  }
  block.textContent = '';
  if (button) block.appendChild(button);
}
