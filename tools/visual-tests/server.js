/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies */
import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { parseCsv } from './url-compare/parse-csv.js';
import { runUrlComparisons } from './url-compare/run.js';
import { startClaudeFix } from './url-compare/claude-fix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory store for url-compare batch jobs, keyed by job id.
// A job is created via POST /api/url-compare/jobs and actually runs once its
// SSE stream is opened via GET /api/url-compare/jobs/:id/stream, so no progress
// events are ever missed by the client.
const urlCompareJobs = new Map();
// Claude-fix jobs: created via POST /api/url-compare/fix/jobs, run via GET .../stream, same
// create-then-stream pattern as urlCompareJobs above so no progress events are ever missed.
const urlCompareFixJobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000; // drop jobs whose stream was never opened after 30 minutes
// Above this ratio on every viewport, the pair isn't a small regression — it's two structurally
// different pages (e.g. the new EDS build vs. the old legacy site). No single-file edit fixes
// that, so refuse the job instead of burning a Claude Code run on an unanswerable diagnosis.
const MAX_FIXABLE_DIFF_RATIO = 0.15;

setInterval(() => {
  const now = Date.now();
  [urlCompareJobs, urlCompareFixJobs].forEach((jobMap) => {
    jobMap.forEach((job, id) => {
      if (job.status === 'pending' && now - job.createdAt > JOB_TTL_MS) {
        jobMap.delete(id);
      }
    });
  });
}, 5 * 60 * 1000).unref();

// Resolves a list of { name, baseUrl, destUrl, threshold? } pairs from a request body.
// Accepts a single baseUrl/destUrl pair, pre-parsed rows, raw CSV text, or a CSV file path.
function resolvePairsFromBody(body) {
  const {
    baseUrl, destUrl, name, rows, csvContent, csvPath,
  } = body || {};

  if (csvPath) {
    const resolvedPath = path.resolve(csvPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`CSV file not found: ${resolvedPath}`);
    }
    return parseCsv(fs.readFileSync(resolvedPath, 'utf8'));
  }
  if (csvContent) {
    return parseCsv(csvContent);
  }
  if (Array.isArray(rows) && rows.length) {
    return rows;
  }
  if (baseUrl && destUrl) {
    return [{ name: name || 'comparison', baseUrl, destUrl }];
  }
  throw new Error('Provide baseUrl+destUrl, rows, csvContent, or csvPath');
}

const app = express();
const port = process.env.PORT || 3001;
const MAX_PORT = 3010; // Maximum port number to try

// Ensure the directory for port.txt exists
const portFilePath = path.join(__dirname, 'port.txt');
const portFileDir = path.dirname(portFilePath);

// Function to check if a port is used by our visual-test server
async function isOurServer(portToCheck) {
  return new Promise((resolve) => {
    http.get(`http://localhost:${portToCheck}/api/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.status === 'ok');
        } catch (e) {
          resolve(false);
        }
      });
    }).on('error', () => {
      resolve(false);
    });
  });
}

// Wrap app.listen in a Promise so async EADDRINUSE errors are catchable
function listenOnPort(currentPort) {
  return new Promise((resolve, reject) => {
    const serverInstance = app.listen(currentPort, () => resolve(serverInstance));
    serverInstance.on('error', reject);
  });
}

async function startServer() {
  let currentPort = port;
  while (currentPort <= MAX_PORT) {
    // eslint-disable-next-line no-await-in-loop
    if (await isOurServer(currentPort)) {
      console.log(`Visual test server already running on port ${currentPort}`);
      process.exit(0);
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await listenOnPort(currentPort);
      try {
        if (!fs.existsSync(portFileDir)) {
          fs.mkdirSync(portFileDir, { recursive: true });
        }
        fs.writeFileSync(portFilePath, currentPort.toString(), 'utf8');
        console.log(`Port ${currentPort} written to ${portFilePath}`);
      } catch (error) {
        console.error('Error writing port file:', error);
      }
      console.log(`Visual test server running on port ${currentPort}`);
      return;
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        currentPort += 1;
      } else {
        console.error('Server failed to start:', error);
        process.exit(1);
      }
    }
  }
  console.error(`Could not find available port between ${process.env.PORT || 3001} and ${MAX_PORT}`);
  process.exit(1);
}

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files from the playwright-report directory
const reportPath = path.join(__dirname, 'playwright-report');
if (fs.existsSync(reportPath)) {
  console.log('Serving Playwright report from:', reportPath);
  app.use('/playwright-report', express.static(reportPath));
} else {
  console.log('Playwright report directory not found at:', reportPath);
}

// Serve url-compare screenshots/diffs/reports so generated report.html files can load their images
const urlCompareResultsPath = path.join(__dirname, 'url-compare', 'results');
fs.mkdirSync(urlCompareResultsPath, { recursive: true });
app.use('/url-compare-results', express.static(urlCompareResultsPath));

// Serve the standalone URL-comparison UI at http://localhost:<port>/url-compare/
app.use('/url-compare', express.static(path.join(__dirname, 'url-compare', 'ui')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Port endpoint
app.get('/port.txt', (req, res) => {
  try {
    const portNumber = fs.readFileSync(portFilePath, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(portNumber);
  } catch (error) {
    console.error('Error reading port file:', error);
    res.status(500).send('Error reading port');
  }
});

// Run visual test endpoint
app.post('/api/run-visual-test', async (req, res) => {
  const { command, component } = req.body;
  console.log('Received request:', { command, component });

  if (!component) {
    return res.status(400).json({ error: 'Missing component name' });
  }

  if (!/^[a-z0-9-]+$/.test(component)) {
    return res.status(400).json({ error: 'Invalid component name' });
  }

  // Get the project root directory (2 levels up from server.js)
  const projectRoot = path.resolve(__dirname, '../../');
  console.log('Project root:', projectRoot);

  // Construct the command to run visual tests for specific block
  // Component should match the block folder name (e.g., 'cards', 'hero', 'tabs')
  const testCommand = `npm run test:visual:block -- tools/visual-tests/blocks/${component}`;
  console.log('Executing command:', testCommand);
  console.log('In directory:', projectRoot);

  try {
    // Ensure the directory exists
    if (!fs.existsSync(projectRoot)) {
      return res.status(400).json({ error: 'Working directory does not exist' });
    }

    exec(testCommand, {
      cwd: projectRoot,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        PATH: process.env.PATH,
      },
      shell: process.platform === 'win32',
    }, (error, stdout, stderr) => {
      console.log('Command output:', stdout);
      if (stderr) console.log('Command errors:', stderr);
      console.log('Current working directory:', process.cwd());
      console.log('Command working directory:', projectRoot);
      console.log('Command:', testCommand);

      if (error) {
        console.error('Command execution error:', error);
        res.status(500).json({
          error: 'Command execution failed',
          details: error.message,
          output: stdout,
          stderr,
        });
        return;
      }

      if (stderr && stderr.toLowerCase().includes('error')) {
        res.status(500).json({
          error: 'Command completed with errors',
          output: stdout,
          stderr,
        });
        return;
      }

      res.json({
        success: true,
        output: stdout,
        stderr,
      });
    });
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({
      error: 'Failed to execute command',
      details: error.message,
    });
  }
  return null;
});

// Run URL-vs-URL visual comparison(s) endpoint (synchronous — waits for the whole batch).
// Body accepts one of:
//   { baseUrl, destUrl, name?, threshold? }        - single pair
//   { rows: [{ baseUrl, destUrl, name?, threshold? }, ...] } - already-parsed bulk rows
//   { csvContent, threshold? }                     - raw CSV text (name,baseUrl,destinationUrl,threshold)
//   { csvPath, threshold? }                        - path to a CSV file on disk
app.post('/api/url-compare', async (req, res) => {
  let pairs;
  try {
    pairs = resolvePairsFromBody(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!pairs.length) {
    return res.status(400).json({ error: 'No valid URL pairs to compare' });
  }

  try {
    const { summary, results, outDir } = await runUrlComparisons(pairs, {
      threshold: req.body?.threshold ? parseFloat(req.body.threshold) : undefined,
    });
    const runId = path.basename(outDir);
    res.json({
      summary,
      results,
      reportUrl: `/url-compare-results/${runId}/report.html`,
    });
  } catch (error) {
    console.error('URL comparison failed:', error);
    res.status(500).json({ error: 'URL comparison failed', details: error.message });
  }
  return null;
});

// Step 1 of the UI's live-progress flow: create a job from the request body (same shape as
// /api/url-compare above) and hand back its id + the resolved pairs, without running anything yet.
app.post('/api/url-compare/jobs', (req, res) => {
  let pairs;
  try {
    pairs = resolvePairsFromBody(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!pairs.length) {
    return res.status(400).json({ error: 'No valid URL pairs to compare' });
  }

  const jobId = crypto.randomUUID();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(urlCompareResultsPath, runId);
  urlCompareJobs.set(jobId, {
    pairs,
    threshold: req.body?.threshold ? parseFloat(req.body.threshold) : undefined,
    status: 'pending',
    outDir,
    createdAt: Date.now(),
  });

  return res.json({
    jobId,
    pairs: pairs.map((p) => ({ name: p.name, baseUrl: p.baseUrl, destUrl: p.destUrl })),
    // Prefix for the relative screenshot/diff paths carried on each 'viewport' progress event
    resultsBaseUrl: `/url-compare-results/${runId}/`,
  });
});

// Step 2: open as an EventSource. Kicks off the actual comparison run on first connection and
// streams 'viewport' / 'pair' progress events, finishing with a 'done' (or 'error') event.
app.get('/api/url-compare/jobs/:id/stream', async (req, res) => {
  const job = urlCompareJobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found (it may have already completed or expired)' });
    return;
  }
  if (job.status !== 'pending') {
    res.status(409).json({ error: 'Job has already been started' });
    return;
  }
  job.status = 'running';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { summary, outDir } = await runUrlComparisons(job.pairs, {
      threshold: job.threshold,
      outDir: job.outDir,
      onEvent: (event) => send(event.type, event),
    });
    const runId = path.basename(outDir);
    send('done', { summary, reportUrl: `/url-compare-results/${runId}/report.html` });
  } catch (error) {
    console.error('URL comparison job failed:', error);
    send('error', { message: error.message });
  } finally {
    urlCompareJobs.delete(req.params.id);
    res.end();
  }
});

// Creates a Claude-fix job for one failed URL comparison. Body:
//   { name, baseUrl, destUrl, viewports: [...pairResult.viewports], resultsBaseUrl }
// viewports/resultsBaseUrl are exactly what the url-compare UI already has for a completed pair.
app.post('/api/url-compare/fix/jobs', (req, res) => {
  const {
    name, baseUrl, destUrl, viewports, resultsBaseUrl,
  } = req.body || {};

  if (!baseUrl || !destUrl || !Array.isArray(viewports) || !viewports.length || !resultsBaseUrl) {
    return res.status(400).json({ error: 'Provide baseUrl, destUrl, viewports, and resultsBaseUrl' });
  }

  if (viewports.every((v) => v.diffRatio >= MAX_FIXABLE_DIFF_RATIO)) {
    return res.status(422).json({
      error: `Diff is too large to auto-fix (every viewport is at or above ${MAX_FIXABLE_DIFF_RATIO * 100}% of pixels differing). `
        + 'This looks like two structurally different pages rather than a small regression — '
        + 'compare two environments of the same EDS site, or fix this manually.',
    });
  }

  const runIdMatch = /^\/url-compare-results\/([^/]+)\/?$/.exec(resultsBaseUrl);
  if (!runIdMatch) {
    return res.status(400).json({ error: 'Invalid resultsBaseUrl' });
  }
  const outDir = path.join(urlCompareResultsPath, runIdMatch[1]);
  if (!fs.existsSync(outDir)) {
    return res.status(400).json({ error: 'Results directory not found — the comparison run may have expired' });
  }

  const jobId = crypto.randomUUID();
  urlCompareFixJobs.set(jobId, {
    name: name || 'comparison',
    baseUrl,
    destUrl,
    viewports,
    outDir,
    status: 'pending',
    createdAt: Date.now(),
  });

  return res.json({ jobId });
});

// Streams a Claude-fix job's progress as SSE: raw 'message' events are Claude Code's own
// --output-format=stream-json objects (assistant text/tool_use, then a final 'result' message),
// forwarded as-is for the UI to render; 'exit' carries the process exit code once it's done.
app.get('/api/url-compare/fix/jobs/:id/stream', (req, res) => {
  const job = urlCompareFixJobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Fix job not found (it may have already completed or expired)' });
    return;
  }
  if (job.status !== 'pending') {
    res.status(409).json({ error: 'Fix job has already been started' });
    return;
  }
  job.status = 'running';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const proc = startClaudeFix({
    name: job.name,
    baseUrl: job.baseUrl,
    destUrl: job.destUrl,
    viewports: job.viewports,
    outDir: job.outDir,
    onEvent: (event) => {
      if (event.kind === 'message') {
        send('message', event.data);
      } else if (event.kind === 'raw') {
        send('log', { line: event.data });
      } else if (event.kind === 'spawn-error') {
        console.error('Claude fix spawn failed:', event.error);
        send('error', { message: event.error });
        urlCompareFixJobs.delete(req.params.id);
        res.end();
      } else if (event.kind === 'exit') {
        send('exit', { code: event.code, stderr: event.stderr });
        urlCompareFixJobs.delete(req.params.id);
        res.end();
      }
    },
  });

  req.on('close', () => {
    proc.kill();
    urlCompareFixJobs.delete(req.params.id);
  });
});

// Start the server
startServer();

export default startServer;
