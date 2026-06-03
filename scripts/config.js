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

/**
 * Gets configs object from config.json.
 * @returns {Promise<object>} Window configs object
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchConfigs() {
  const lang = document.documentElement.lang || 'en';
  window.configs = window.configs || {};
  if (!window.configs[lang]) {
    window.configs[lang] = new Promise((resolve) => {
      // Check if config JSON exists in sessionStorage
      const configKey = `config-${lang}`;
      const cachedConfigJSON = window.sessionStorage.getItem(configKey);

      if (cachedConfigJSON) {
        try {
          const json = JSON.parse(cachedConfigJSON);
          const configs = {};
          json.data
            ?.filter((config) => config.Key)
            .forEach((config) => {
              configs[toCamelCase(config.Key)] = config.Value;
            });
          window.configs[lang] = configs;
          resolve(configs);
          return;
        } catch (e) {
          // If parsing fails, continue to fetch
          // eslint-disable-next-line no-console
          console.warn('Failed to parse cached config, fetching fresh:', e);
        }
      }

      // Fetch from config.json if not in sessionStorage
      const configPath = `/${lang}/config.json`;
      fetch(configPath)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return { data: [] };
        }).then((json) => {
          // Store entire JSON in sessionStorage
          try {
            window.sessionStorage.setItem(configKey, JSON.stringify(json));
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Failed to store config in sessionStorage:', e);
          }

          const configs = {};
          json.data
            ?.filter((config) => config.Key)
            .forEach((config) => {
              configs[toCamelCase(config.Key)] = config.Value;
            });

          window.configs[lang] = configs;
          resolve(window.configs[lang]);
        }).catch(() => {
          // error loading configs
          window.configs[lang] = {};
          resolve(window.configs[lang]);
        });
    });
  }
  return window.configs[lang];
}
