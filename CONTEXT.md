# Context for bbl-pweb-site

> Summarized from Claude Code sessions during migration to GitHub Copilot on 2026-09-24.
> Original transcripts: `/Users/aadilk/.claude/projects/-Users-aadilk-Documents-Projects-bbl-bbl-pweb-site/` (local only, not in this repo).

### What this is
This project is the BBL PWSM/pweb site. The Claude sessions are focused on specific UI and authoring bug investigations, including cursor behavior and smart-cropped image display for desktop and mobile screens.

### Key decisions & why
- **Bug investigation and regression prevention** — the work focused on specific user-facing issues rather than broad refactors.
- **Responsive/authoring correctness** — the sessions explicitly targeted desktop and mobile layout behavior to match live authoring expectations.
- **Feature-branch continuity** — the project was active on a branch, with work continuing on a focused fix set rather than a clean restart.

### Current status
- Working: specific UI bug diagnosis and validation for cursor/image rendering issues.
- In progress / known issues: the repo still shows local uncommitted work and outstanding bug fixes tied to authoring behavior.

### How to run / deploy
Use the repo README and the working authoring workflow for the site, along with the project’s local development and validation steps.

### Open questions / next steps
- Confirm whether the cursor and smart-crop fixes hold across both desktop and mobile authoring states.
- Finalize the remaining bugfixes and reconcile the local branch state before broader release.

### Source sessions
| Session ID | Dates | First prompt | Turns |
|---|---|---|---:|
| `81b6a2dc-cbfa-498a-9d40-0a81dc951f10` | 2026-09-20 to 2026-09-20 | `make sure cursor should not be pointer until it's disabled` | 19 |
| `b9bf4acf-85e6-42e6-8c02-010119115ebe` | 2026-09-05 to 2026-09-05 | `try helping me investigate why I can not be able to see smart cropped image for both desktop and mobile screens ...` | 74 |
