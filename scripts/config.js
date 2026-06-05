/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { toCamelCase } from './aem.js';

function getPageLanguage() {
  return document.querySelector('meta[name="language"]')?.content || null;
}

function parseConfigEntries(json) {
  const configs = {};
  json.data
    ?.filter((config) => config.Key)
    .forEach((config) => {
      configs[toCamelCase(config.Key)] = config.Value;
    });
  return configs;
}

async function safeFetchJson(url) {
  try {
    const resp = await fetch(url);
    if (resp.ok) return resp.json();
  } catch (e) { /* ignore */ }
  return { data: [] };
}

/**
 * Gets configs object from configs.json.
 * If the page has a <meta name="language"> tag, merges default configs with
 * language-specific ones (/configs-{language}.json), giving precedence to the
 * language-specific values.
 * @returns {Promise<object>} Window configs object
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchConfigs() {
  const pageLanguage = getPageLanguage();
  // window.configs.data is the existing key; for lang variants use data-{language}
  const windowKey = pageLanguage ? `data-${pageLanguage}` : 'data';

  window.configs = window.configs || {};
  if (!window.configs[windowKey]) {
    window.configs[windowKey] = new Promise((resolve) => {
      const storageKey = pageLanguage ? `bbl-config-${pageLanguage}` : 'bbl-config';
      const cachedStr = window.sessionStorage.getItem(storageKey);

      if (cachedStr) {
        try {
          const configs = JSON.parse(cachedStr);
          window.configs[windowKey] = configs;
          resolve(configs);
          return;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to parse cached config, fetching fresh:', e);
        }
      }

      const fetchDefault = fetch('/configs.json')
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] }));

      const fetchLang = pageLanguage
        ? safeFetchJson(`/configs-${pageLanguage}.json`)
        : Promise.resolve({ data: [] });

      Promise.all([fetchDefault, fetchLang]).then(([defaultJson, langJson]) => {
        const configs = {
          ...parseConfigEntries(defaultJson),
          ...parseConfigEntries(langJson),
        };

        try {
          const toStore = configs;
          window.sessionStorage.setItem(storageKey, JSON.stringify(toStore));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to store config in sessionStorage:', e);
        }

        window.configs[windowKey] = configs;
        resolve(configs);
      });
    });
  }
  return window.configs[windowKey];
}
