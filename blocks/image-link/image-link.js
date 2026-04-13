export default function decorate(block) {
  const rows = [...block.children];

  // rows[0] = image (reference field -> renders as <picture>)
  // rows[1] = alt text
  // rows[2] = href

  const picture = rows[0]?.querySelector('picture');
  const altText = rows[1]?.querySelector('div')?.textContent?.trim() || '';
  const href = rows[2]?.querySelector('div')?.textContent?.trim() || '';

  block.textContent = '';

  if (!picture) return;

  if (altText) {
    const img = picture.querySelector('img');
    if (img) img.alt = altText;
  }

  if (href) {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.appendChild(picture);
    block.appendChild(anchor);
  } else {
    block.appendChild(picture);
  }
}
