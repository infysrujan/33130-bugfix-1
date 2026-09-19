// Pixel-diffs two PNG screenshot buffers and decides pass/fail against a diff-ratio threshold.

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Per-pixel colour-matching sensitivity for pixelmatch itself (0-1). This is distinct from
// the diffRatio pass/fail threshold below, which caps how much of the page may differ overall.
const PIXEL_MATCH_SENSITIVITY = 0.1;

function toPNG(buffer) {
  return PNG.sync.read(buffer);
}

// Pads a screenshot onto a white canvas of the target size so differently-sized pages
// (e.g. dynamic content changed page height) can still be diffed pixel-for-pixel.
function padToSize(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const padded = new PNG({ width, height });
  padded.data.fill(255);
  PNG.bitblt(png, padded, 0, 0, png.width, png.height, 0, 0);
  return padded;
}

/**
 * @param {Buffer} baseBuffer
 * @param {Buffer} destBuffer
 * @param {number} threshold Max allowed diff-pixel ratio (0-1) to still count as "passed"
 */
export function compareScreenshots(baseBuffer, destBuffer, threshold) {
  const basePng = toPNG(baseBuffer);
  const destPng = toPNG(destBuffer);

  const width = Math.max(basePng.width, destPng.width);
  const height = Math.max(basePng.height, destPng.height);

  const baseAligned = padToSize(basePng, width, height);
  const destAligned = padToSize(destPng, width, height);

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    baseAligned.data,
    destAligned.data,
    diff.data,
    width,
    height,
    { threshold: PIXEL_MATCH_SENSITIVITY },
  );

  const totalPixels = width * height;
  const diffRatio = totalPixels === 0 ? 0 : diffPixels / totalPixels;

  return {
    width,
    height,
    diffPixels,
    totalPixels,
    diffRatio,
    passed: diffRatio <= threshold,
    diffPng: PNG.sync.write(diff),
  };
}

export default compareScreenshots;
