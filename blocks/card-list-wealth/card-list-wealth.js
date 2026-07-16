import { moveInstrumentation } from '../../scripts/scripts.js';

const CHECKMARK_SVG = `<svg width="18" height="13" viewBox="0 0 25 13" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M1.46094 5.63309L6.72891 10.9004L16.6567 0.972656" stroke="#0064FF" stroke-width="2"></path>
</svg>`;

export default function decorate(block) {
  const rows = [...block.children];
  block.innerHTML = '';

  const content = document.createElement('div');
  content.className = 'content';

  rows.forEach((row) => {
    const cols = [...row.children];
    const logo = cols[0]?.querySelector('picture');
    const theme = cols[1]?.textContent?.trim() || 'default';
    const title = cols[2]?.textContent?.trim();
    const description = cols[3]?.textContent?.trim();
    const eyebrow = cols[4]?.textContent?.trim();
    const listEl = cols[5]?.querySelector('ul');
    const buttonEl = cols[6]?.querySelector('p');

    const card = document.createElement('div');
    card.className = `card-list-wealth-card card-theme-${theme}`;

    // Logo area
    const logoDiv = document.createElement('div');
    logoDiv.className = 'card-logo';
    if (logo) logoDiv.append(logo);
    card.append(logoDiv);

    // Card body
    const body = document.createElement('div');
    body.className = 'card-body';

    if (title) {
      const heading = document.createElement('h2');
      heading.className = 'card-title';
      heading.textContent = title;
      body.append(heading);
    }

    if (description) {
      const desc = document.createElement('p');
      desc.className = 'card-description';
      desc.textContent = description;
      body.append(desc);
    }

    if (eyebrow) {
      const eyebrowEl = document.createElement('h3');
      eyebrowEl.className = 'card-eyebrow';
      eyebrowEl.textContent = eyebrow;
      body.append(eyebrowEl);
    }

    if (listEl) {
      const benefitsDiv = document.createElement('div');
      benefitsDiv.className = 'card-benefits';
      [...listEl.querySelectorAll('li')].forEach((li) => {
        const benefitDiv = document.createElement('div');
        benefitDiv.className = 'card-benefit';
        benefitDiv.innerHTML = `${CHECKMARK_SVG}<span>${li.textContent.trim()}</span>`;
        benefitsDiv.append(benefitDiv);
      });
      body.append(benefitsDiv);
    }

    card.append(body);

    // CTA button
    if (buttonEl) {
      const ctaDiv = document.createElement('div');
      ctaDiv.className = 'card-cta';
      const link = buttonEl.querySelector('.button-container a');
      if (link) {
        link.classList.remove('button');
        link.classList.add('button-m');
        ctaDiv.append(link);
        card.append(ctaDiv);
      }
    }

    const itemPadding = document.createElement('div');
    itemPadding.className = 'card-list-item-padding';
    itemPadding.append(card);

    moveInstrumentation(row, card);
    content.append(itemPadding);
  });

  block.append(content);
}
