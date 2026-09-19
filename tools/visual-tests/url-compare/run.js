// Orchestrates a batch of base-vs-destination URL comparisons: captures screenshots per
// viewport for every pair, pixel-diffs them, writes screenshots/diffs to disk, and emits
// an HTML tracker report plus a pass/fail summary.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

import { VIEWPORTS as configViewports } from '../config.js';
import { captureFullPageScreenshot } from './capture.js';
import { compareScreenshots } from './compare.js';
import { buildHtmlReport } from './report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_THRESHOLD = 0.01;
const RESULTS_ROOT = path.join(__dirname, 'results');

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'comparison';
}

function toIntViewport(viewport) {
  return {
    label: viewport.label,
    width: typeof viewport.width === 'string' ? parseInt(viewport.width, 10) : viewport.width,
    height: typeof viewport.height === 'string' ? parseInt(viewport.height, 10) : viewport.height,
  };
}

/**
 * @param {Array<{ name: string, baseUrl: string, destUrl: string, threshold?: number }>} pairs
 * @param {{
 *   viewports?: Array,
 *   threshold?: number,
 *   outDir?: string,
 *   onEvent?: (event: object) => void,
 * }} [options]
 *
 * onEvent is invoked with:
 *   { type: 'viewport', pairIndex, pairTotal, pairName, viewport: {...viewportResult} }
 *   { type: 'pair', pairIndex, pairTotal, result: {...pairResult} }
 * as each one completes, so callers (e.g. an SSE endpoint) can stream live progress
 * instead of waiting for the whole batch to finish.
 */
export async function runUrlComparisons(pairs, options = {}) {
  if (!pairs || !pairs.length) {
    throw new Error('No URL pairs provided for comparison');
  }

  const onEvent = options.onEvent || (() => {});
  const viewports = (options.viewports || configViewports).map(toIntViewport);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = options.outDir || path.join(RESULTS_ROOT, runId);
  const screenshotsDir = path.join(outDir, 'screenshots');
  const diffsDir = path.join(outDir, 'diffs');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(diffsDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  const pairTotal = pairs.length;

  try {
    // Pairs are processed sequentially to avoid overloading the browser with too many
    // concurrent full-page navigations; base/destination captures within a pair run in parallel.
    // eslint-disable-next-line no-restricted-syntax
    for (const [pairIndex, pair] of pairs.entries()) {
      const threshold = pair.threshold ?? options.threshold ?? DEFAULT_THRESHOLD;
      const slug = slugify(pair.name);
      const viewportResults = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const viewport of viewports) {
        // eslint-disable-next-line no-await-in-loop
        const [baseBuf, destBuf] = await Promise.all([
          captureFullPageScreenshot(browser, pair.baseUrl, viewport),
          captureFullPageScreenshot(browser, pair.destUrl, viewport),
        ]);

        const cmp = compareScreenshots(baseBuf, destBuf, threshold);

        const baseImgName = `${slug}-${viewport.label}-base.png`;
        const destImgName = `${slug}-${viewport.label}-dest.png`;
        const diffImgName = `${slug}-${viewport.label}-diff.png`;
        fs.writeFileSync(path.join(screenshotsDir, baseImgName), baseBuf);
        fs.writeFileSync(path.join(screenshotsDir, destImgName), destBuf);
        fs.writeFileSync(path.join(diffsDir, diffImgName), cmp.diffPng);

        const viewportResult = {
          label: viewport.label,
          width: cmp.width,
          height: cmp.height,
          passed: cmp.passed,
          diffRatio: cmp.diffRatio,
          diffPixels: cmp.diffPixels,
          totalPixels: cmp.totalPixels,
          baseImage: `screenshots/${baseImgName}`,
          destImage: `screenshots/${destImgName}`,
          diffImage: `diffs/${diffImgName}`,
        };
        viewportResults.push(viewportResult);
        onEvent({
          type: 'viewport', pairIndex, pairTotal, pairName: pair.name, viewport: viewportResult,
        });
      }

      const result = {
        name: pair.name,
        baseUrl: pair.baseUrl,
        destUrl: pair.destUrl,
        threshold,
        passed: viewportResults.every((v) => v.passed),
        viewports: viewportResults,
      };
      results.push(result);
      onEvent({
        type: 'pair', pairIndex, pairTotal, result,
      });
    }
  } finally {
    await browser.close();
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
  };

  const reportPath = path.join(outDir, 'report.html');
  fs.writeFileSync(reportPath, buildHtmlReport(results, summary));

  const summaryPath = path.join(outDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ summary, results }, null, 2));

  return {
    outDir, reportPath, summaryPath, summary, results,
  };
}

export default runUrlComparisons;
