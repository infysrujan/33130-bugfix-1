function getEmbedHtml(embedRow) {
  if (!embedRow) return '';

  const embedHtml = embedRow.innerHTML.trim();
  const embedText = embedRow.textContent?.trim() || '';
  const hasRenderedEmbed = !!embedRow.querySelector('iframe');
  const hasHtmlLikeText = /<(div|iframe|p|a|br)\b/i.test(embedText);

  if (!hasRenderedEmbed && hasHtmlLikeText) {
    return embedText;
  }

  return embedHtml;
}

export default function decorate(block) {
  const [embedRow] = [...block.children];
  const embedHtml = getEmbedHtml(embedRow);

  block.innerHTML = `
    <div class="stock-ticker-content">
      ${embedHtml ? `<div class="stock-ticker-embed">${embedHtml}</div>` : ''}
    </div>
  `;
}
