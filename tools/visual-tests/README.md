# Visual Regression Testing Setup & Workflow


### Prerequisites
* **Docker**: Installed and running. 
* **Node.js**: Node.js 18+ (LTS recommended).
* **Git**: Installed and configured.
* **Repository**: Cloned locally, with the latest code.

---
### Follow the given link for the detailed instructions
* https://documentation--aem-visual-checker--acs-ui.aem.page/tools/visual-tests/developer-onboarding.html

---

### Command for single block snapshot updates


---
### Husky file to be added
* **step 1:** Go to .husky folder.
* **step 2:** Open '_' folder.
* **step 3:** Create '.husky' file.
* **step 4:** Add the following content to the file:
```
#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky (debug) - $1"
    fi
  }

  readonly hook_name="$(basename -- "$0")"
  debug "starting $hook_name..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi

  readonly husky_skip_init=1
  export husky_skip_init
  sh -e "$0" "$@"
  exitCode="$?"

  if [ $exitCode != 0 ]; then
    echo "husky - $hook_name hook exited with code $exitCode (error)"
  fi

  if [ $exitCode = 127 ]; then
    echo "husky - command not found in PATH=$PATH"
  fi

  exit $exitCode
fi

```
---

### Commands to be used
- Most of the time will use the docker commands.
- To generate the snapshots use
```
npm run test:visual:generate
```

- To update the snapshots
```
npm run test:visual:docker:update
```

- To run the tests
```
npm run test:visual:docker

```
- To update single block snapshot use
```
npm run test:visual:docker:update --blocks/<name>

```

### Before commit ensure to run in the terminal
```
npm start
```

---
### URL-vs-URL visual comparison

Compares two live URLs (e.g. a "base" prod/main page vs a "destination" feature-branch page)
by capturing full-page screenshots at each configured viewport (`tools/visual-tests/config.js`
`VIEWPORTS`), pixel-diffing them, and producing a single pass/fail HTML tracker report.

**Browser UI (recommended):**
```
npm run test:visual:server
```
then open **http://localhost:3001/url-compare/**. Two modes:
- **Single Page** — enter a Base URL and Destination URL (plus optional name/threshold) and hit
  "Run Comparison".
- **CSV Batch** — drag & drop or browse for a CSV (columns: `name`, `baseUrl`, `destinationUrl`,
  `threshold` optional — see `tools/visual-tests/url-compare/example.csv`) and hit "Run Batch".

Both modes process pairs one by one and stream live progress: each row shows a spinner while
running, per-viewport pass/fail chips as they complete, and a final check/cross once the pair is
done. Once everything finishes you get pass/fail summary tiles and a **View Full Report** button
that opens the same HTML tracker report described below (with side-by-side base/destination/diff
images per viewport).

**CLI (for scripting/CI):**

Single pair:
```
npm run test:visual:url-compare -- --base <baseUrl> --dest <destUrl> --name "Home"
```

Bulk, via CSV:
```
npm run test:visual:url-compare -- --csv tools/visual-tests/url-compare/example.csv
```

Both modes print a `passed/total` summary to the terminal and exit non-zero if any pair fails.
Screenshots, diff images, and the HTML tracker report (`report.html`) are written to
`tools/visual-tests/url-compare/results/<run-id>/`.

**Via the local server API** (`npm run test:visual:server`, same server the Sidekick Library
"Run Test" button talks to) — `POST http://localhost:3001/api/url-compare` with one of:
```jsonc
{ "baseUrl": "...", "destUrl": "...", "name": "Home" }        // single pair
{ "rows": [{ "baseUrl": "...", "destUrl": "...", "name": "..." }] } // bulk, pre-parsed
{ "csvContent": "name,baseUrl,destinationUrl\n..." }           // bulk, raw CSV text
{ "csvPath": "tools/visual-tests/url-compare/example.csv" }    // bulk, CSV file on disk
```
Response includes `summary` (`total`/`passed`/`failed`) and `reportUrl`
(`/url-compare-results/<run-id>/report.html`) served by the same server.

The browser UI itself calls a two-step job API instead (`POST /api/url-compare/jobs` to resolve
the pairs and get a `jobId`, then `GET /api/url-compare/jobs/:id/stream` as an EventSource) so it
can show live per-pair/per-viewport progress — useful if you're building another UI on top.

**"Fix with Claude"** — every failed row in the UI gets a button that spawns a restricted,
non-interactive Claude Code session (`tools/visual-tests/url-compare/claude-fix.js`) to look at
that pair's diff images, find the likely cause in this repo, and edit the file(s) directly. Safety
boundaries are enforced at the process level, not just by prompt wording:
- `--restricted --tools Read,Edit,Write,Grep,Glob` — no Bash/PowerShell/shell execution at all,
  and settings/git/tool-config files need human approval (which is auto-denied, since nobody's
  there to approve it)
- `--permission-mode acceptEdits` + `--permission-prompts none` — ordinary file edits proceed
  without a prompt; anything else that would need one is denied rather than hanging
- `--max-budget-usd` caps spend per run (env var `CLAUDE_FIX_MAX_BUDGET_USD`, default `3`)
- it never runs git and never commits/pushes — **review with `git diff` before committing**

It looks for the Claude Code binary via `CLAUDE_CLI_PATH` env var first, then a standalone
`claude` on PATH, then the native binary bundled with the Claude Code VS Code extension
(`~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe`).