// Spawns Claude Code in restricted, non-interactive mode to investigate a visual-regression
// diff (screenshots already on disk) and fix the root cause directly in this repo.
//
// Safety boundaries, all enforced at the process level (not just via prompt wording):
//   - --restricted strips out Bash/PowerShell/REPL and confines file tools to the working dir
//   - --tools explicitly allow-lists Read, Edit, Write, Grep, Glob only (no shell execution)
//   - --permission-mode acceptEdits lets file edits proceed non-interactively; anything else
//     that would need a prompt is auto-denied via --permission-prompts none instead of hanging
//   - --max-budget-usd caps spend for a single invocation
//   - it never runs git, and never commits/pushes

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

const ALLOWED_TOOLS = 'Read,Edit,Write,Grep,Glob';
const MAX_BUDGET_USD = process.env.CLAUDE_FIX_MAX_BUDGET_USD || '3';

function findClaudeBinary() {
  if (process.env.CLAUDE_CLI_PATH && fs.existsSync(process.env.CLAUDE_CLI_PATH)) {
    return process.env.CLAUDE_CLI_PATH;
  }

  // Fall back to the native binary bundled with the Claude Code VS Code extension, since the
  // standalone `claude` CLI may not be on PATH even when the extension is installed and used.
  const extensionRoots = [
    path.join(os.homedir(), '.vscode', 'extensions'),
    path.join(os.homedir(), '.vscode-insiders', 'extensions'),
  ];
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';

  // eslint-disable-next-line no-restricted-syntax
  for (const dir of extensionRoots) {
    if (!fs.existsSync(dir)) continue;
    const match = fs.readdirSync(dir)
      .filter((name) => name.startsWith('anthropic.claude-code-'))
      .sort()
      .pop(); // newest version wins if multiple are installed
    if (match) {
      const candidate = path.join(dir, match, 'resources', 'native-binary', binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return 'claude'; // last resort: rely on PATH (works if the standalone CLI is installed)
}

function buildPrompt({
  name, baseUrl, destUrl, viewports, outDir,
}) {
  const viewportLines = viewports.map((v) => `- ${v.label} (${v.width}x${v.height}): ${(v.diffRatio * 100).toFixed(2)}% of pixels differ\n`
    + `  base screenshot:  ${path.join(outDir, v.baseImage)}\n`
    + `  dest screenshot:  ${path.join(outDir, v.destImage)}\n`
    + `  diff image:       ${path.join(outDir, v.diffImage)}`).join('\n');

  return `A visual regression check flagged a difference between two pages of this Adobe Edge Delivery Services (AEM) site.

Comparison name: ${name}
Base URL (expected/reference):      ${baseUrl}
Destination URL (page under test):  ${destUrl}

Per-viewport screenshots and pixel-diff images are already on disk — open them with the Read tool:
${viewportLines}

Task:
1. Read the diff image(s) to see which part of the page visually changed.
2. Search this repository's blocks/CSS/JS for the component responsible for that part of the page (the destination URL's path may hint at which page/template/block is involved).
3. Identify the most likely root cause of the regression in this codebase.
4. Fix it by editing the relevant file(s) directly. Keep the change minimal and scoped to the regression — do not refactor unrelated code.
5. Finish with a short summary naming the exact file(s) you changed and why.

If you cannot confidently identify the cause from what's available, say so plainly instead of guessing and making unrelated edits.`;
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.baseUrl
 * @param {string} params.destUrl
 * @param {Array<{ label: string, width: number, height: number, diffRatio: number, baseImage: string, destImage: string, diffImage: string }>} params.viewports
 * @param {string} params.outDir Absolute path the relative image paths above are rooted at
 * @param {(event: object) => void} params.onEvent
 * @returns {{ kill: () => void }}
 */
export function startClaudeFix(params) {
  const {
    name, baseUrl, destUrl, viewports, outDir, onEvent,
  } = params;

  const bin = findClaudeBinary();
  const prompt = buildPrompt({
    name, baseUrl, destUrl, viewports, outDir,
  });

  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose', // required by the CLI whenever --print is combined with --output-format=stream-json
    '--restricted',
    '--tools', ALLOWED_TOOLS,
    '--permission-mode', 'acceptEdits',
    '--permission-prompts', 'none',
    '--no-session-persistence',
    '--max-budget-usd', String(MAX_BUDGET_USD),
  ];

  // Bare "claude" (PATH fallback) may resolve to a .cmd shim on Windows, which needs a shell to
  // execute; a resolved absolute .exe path does not, and skipping the shell avoids re-quoting
  // the (multi-line) prompt argument.
  const useShell = bin === 'claude';

  const child = spawn(bin, args, {
    cwd: REPO_ROOT,
    shell: useShell,
    windowsHide: true,
    // No stdin is ever sent; explicitly closing it avoids the CLI's ~3s "waiting for stdin" stall.
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        try {
          onEvent({ kind: 'message', data: JSON.parse(line) });
        } catch {
          onEvent({ kind: 'raw', data: line });
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString('utf8'); });

  child.on('error', (error) => {
    onEvent({ kind: 'spawn-error', error: error.message });
  });

  child.on('close', (code) => {
    onEvent({ kind: 'exit', code, stderr: stderrBuffer.trim() });
  });

  return { kill: () => child.kill() };
}

export default startClaudeFix;
