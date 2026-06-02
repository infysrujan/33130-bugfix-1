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
 * Gets configs object from configs.json.
 * @returns {Promise<object>} Window configs object
 */
// eslint-disable-next-line import/prefer-default-export
export async function fetchConfigs() {
  window.configs = window.configs || {};
  if (!window.configs.data) {
    window.configs.data = new Promise((resolve) => {
      const configKey = 'bbl-config';
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
          window.configs.data = configs;
          resolve(configs);
          return;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to parse cached config, fetching fresh:', e);
        }
      }

      fetch('/configs.json')
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return { data: [] };
        }).then((json) => {
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

          window.configs.data = configs;
          resolve(window.configs.data);
        }).catch(() => {
          window.configs.data = {};
          resolve(window.configs.data);
        });
    });
  }
  return window.configs.data;
}
