import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { createEl } from './helpers/utils.js';
import { buildThailandUI, buildOverseasUI } from './helpers/ui-helpers.js';

// ─── Parse EDS block data ─────────────────────────────────────────────────────

function parseBlockData(block) {
  const rows = Array.from(block.children);
  const locationType = rows[0]?.querySelector('p')?.textContent?.trim().toLowerCase() || 'thailand';
  const serviceItems = rows[1]?.querySelectorAll('li') || [];
  const services = Array.from(serviceItems).map((li) => li.textContent.trim()).filter(Boolean);
  const specialServiceName = rows[2]?.querySelector('p')?.textContent?.trim() || '';
  const fragmentLink = rows[3]?.querySelector('a');
  const specialFragmentPath = fragmentLink ? fragmentLink.getAttribute('href') : '';
  return {
    locationType, services, specialServiceName, specialFragmentPath,
  };
}

// ─── Decorate ─────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const data = parseBlockData(block);
  block.innerHTML = '';

  const wrapper = createEl('<div class="locate-us-wrapper"></div>');
  block.appendChild(wrapper);

  if (data.locationType === 'thailand') {
    await buildThailandUI(wrapper, data, placeholders, configs);
  } else if (data.locationType === 'overseas') {
    await buildOverseasUI(wrapper, placeholders, configs);
  }
}
