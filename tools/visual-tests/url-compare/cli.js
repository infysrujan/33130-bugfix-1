#!/usr/bin/env node
// CLI for the URL-vs-URL visual comparison tool.
//
// Single pair:
//   node tools/visual-tests/url-compare/cli.js --base <url> --dest <url> [--name <name>] [--threshold 0.01]
//
// Bulk (CSV with columns: name, baseUrl, destinationUrl, threshold):
//   node tools/visual-tests/url-compare/cli.js --csv path/to/pairs.csv [--threshold 0.01]

import fs from 'fs';
import path from 'path';

import { parseCsv } from './parse-csv.js';
import { runUrlComparisons } from './run.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function printUsage() {
  console.error('Usage:');
  console.error('  node tools/visual-tests/url-compare/cli.js --base <url> --dest <url> [--name <name>] [--threshold 0.01]');
  console.error('  node tools/visual-tests/url-compare/cli.js --csv <path-to-csv> [--threshold 0.01]');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const threshold = args.threshold ? parseFloat(args.threshold) : undefined;

  let pairs;
  if (args.csv) {
    const csvPath = path.resolve(args.csv);
    if (!fs.existsSync(csvPath)) {
      console.error(`CSV file not found: ${csvPath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(csvPath, 'utf8');
    pairs = parseCsv(content);
    if (!pairs.length) {
      console.error('No valid rows found in CSV (need "baseUrl" and "destinationUrl" columns)');
      process.exit(1);
    }
  } else if (args.base && args.dest) {
    pairs = [{
      name: args.name || 'comparison', baseUrl: args.base, destUrl: args.dest, threshold,
    }];
  } else {
    printUsage();
    process.exit(1);
    return;
  }

  console.log(`Running ${pairs.length} URL comparison(s)...`);
  const { summary, reportPath } = await runUrlComparisons(pairs, { threshold });

  console.log('');
  pairs.forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.name}: ${pair.baseUrl} vs ${pair.destUrl}`);
  });
  console.log('');
  console.log(`Result: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  console.log(`Report: ${reportPath}`);

  if (summary.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('URL comparison failed:', error);
  process.exit(1);
});
