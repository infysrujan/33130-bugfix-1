import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  const rows = [...block.children];

  const titleEl = rows[0]?.querySelector('div');
  const title = titleEl?.innerHTML || '';

  const bgColor = rows[1]?.querySelector('div')?.textContent?.trim() || 'active-blue';

  const items = rows.slice(2).map((row) => {
    const cells = [...row.children];
    const picture = cells[0]?.querySelector('picture')?.outerHTML || '';
    const content = cells[1]?.innerHTML || '';
    return { picture, content };
  });

  block.innerHTML = `
    <div class="menu-list-wrapper menu-list-${bgColor}">
      <div class="menu-list-title">${title}</div>
      <ul class="menu-list-items">
        ${items.map(({ picture, content }) => `
          <li class="menu-list-item">
            <div class="menu-list-item-image">${picture}</div>
            <div class="menu-list-item-content">${content}</div>
          </li>
        `).join('')}
      </ul>
    </div>`;

  [
    [rows[0], block.querySelector('.menu-list-title')],
    [rows[1], block.querySelector('.menu-list-wrapper')],
    ...rows.slice(2).map((row, i) => [row, block.querySelectorAll('.menu-list-item')[i]]),
  ].forEach(([src, dst]) => {
    if (src && dst) moveInstrumentation(src, dst);
  });
}
