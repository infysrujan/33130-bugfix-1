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
import { getLang } from './scripts.js';

function getPageLanguage() {
  return document.querySelector('meta[name="language"]')?.content || null;
}

function parseEntries(json, valueKey) {
  const result = {};
  json.data
    ?.filter((item) => item.Key)
    .forEach((item) => {
      result[toCamelCase(item.Key)] = item[valueKey];
    });
  return result;
}

async function safeFetchJson(url) {
  try {
    const resp = await fetch(url);
    if (resp.ok) return resp.json();
  } catch (e) { /* ignore */ }
  return { data: [] };
}

/**
 * Gets placeholders object.
 * If the page has a <meta name="language"> tag, merges default lang placeholders
 * with language-specific ones (/placeholders-{language}.json), giving precedence
 * to the language-specific values.
 * @returns {Promise<object>} Window placeholders object
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchPlaceholders() {
  const lang = getLang();
  const pageLanguage = getPageLanguage();
  const cacheKey = pageLanguage ? `${lang}-${pageLanguage}` : lang;

  window.placeholders = window.placeholders || {};
  if (!window.placeholders[cacheKey]) {
    window.placeholders[cacheKey] = new Promise((resolve) => {
      const storageKey = `placeholders-${cacheKey}`;
      const cachedStr = window.sessionStorage.getItem(storageKey);

      if (cachedStr) {
        try {
          const placeholders = JSON.parse(cachedStr);
          window.placeholders[cacheKey] = placeholders;
          resolve(placeholders);
          return;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to parse cached placeholders, fetching fresh:', e);
        }
      }

      const fetchDefault = fetch(`/${lang}/placeholders.json`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] }));

      const fetchLang = pageLanguage
        ? safeFetchJson(`/placeholders-${pageLanguage}.json`)
        : Promise.resolve({ data: [] });

      Promise.all([fetchDefault, fetchLang]).then(([defaultJson, langJson]) => {
        const defaultPlaceholders = parseEntries(defaultJson, 'Text');
        const langPlaceholders = parseEntries(langJson, 'Text');
        // eslint-disable-next-line no-console
        console.log(`[placeholders] default (${lang}):`, defaultPlaceholders);
        // eslint-disable-next-line no-console
        console.log(`[placeholders] language (${pageLanguage || 'none'}):`, langPlaceholders);

        const placeholders = {
          ...defaultPlaceholders,
          ...langPlaceholders,
        };
        // eslint-disable-next-line no-console
        console.log('[placeholders] combined (lang overrides default):', placeholders);

        try {
          const toStore = placeholders;
          window.sessionStorage.setItem(storageKey, JSON.stringify(toStore));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to store placeholders in sessionStorage:', e);
        }

        window.placeholders[cacheKey] = placeholders;
        resolve(placeholders);
      });
    });
  }
  return window.placeholders[cacheKey];
}
