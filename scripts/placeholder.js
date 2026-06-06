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

/**
 * Gets placeholders object.
 * @returns {object} Window placeholders object
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchPlaceholders() {
  const lang = getLang();
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[lang]) {
    window.placeholders[lang] = new Promise((resolve) => {
      // Check if placeholders JSON exists in sessionStorage
      const placeholderKey = `placeholders-${lang}`;
      const cachedPlaceholdersJSON = window.sessionStorage.getItem(placeholderKey);

      if (cachedPlaceholdersJSON) {
        try {
          const json = JSON.parse(cachedPlaceholdersJSON);
          const placeholders = {};
          json.data
            ?.filter((placeholder) => placeholder.Key)
            .forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });
          window.placeholders[lang] = placeholders;
          resolve(placeholders);
          return;
        } catch (e) {
          // If parsing fails, continue to fetch
          // eslint-disable-next-line no-console
          console.warn('Failed to parse cached placeholders, fetching fresh:', e);
        }
      }

      // Fetch from placeholders.json if not in sessionStorage
      const placeholdersPath = `/${lang}/placeholders.json`;
      fetch(placeholdersPath)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return {};
        }).then((json) => {
          // Store entire JSON in sessionStorage
          try {
            window.sessionStorage.setItem(placeholderKey, JSON.stringify(json));
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Failed to store placeholders in sessionStorage:', e);
          }

          const placeholders = {};
          json.data
            ?.filter((placeholder) => placeholder.Key)
            .forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });

          window.placeholders[lang] = placeholders;
          resolve(window.placeholders[lang]);
        }).catch(() => {
          // error loading placeholders
          window.placeholders[lang] = {};
          resolve(window.placeholders[lang]);
        });
    });
  }
  return window.placeholders[lang];
}
