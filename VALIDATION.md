# v6.0.0-rc1 acceptance checks

**Do not merge this release candidate to `main` until one real-browser regression export has been inspected.** Previous results below apply to earlier versions and are not proof of rc1 behavior.

## Evidence already observed (prior builds)

| Conversation | Last observed | Result |
| --- | --- | --- |
| Country Dashboard - Main History | v5.16 | 20/20 numbered turns; two Project references (Country Dashboard; Menu_v3_updated) identified; **0 file bytes** recovered; title incorrectly fell back to “Dashboard” (fixed conservatively in rc1 by asking when unverified). |
| Groups in GIRM - Economic Control | Earlier experiment | 98/98 turns, seven embedded images recovered; Word document references including Gruppi_Groups and Black_Groups_GIRM_User_Guide; no binary Word recovery. |
| Word Online ODT probe | Separate F12 experiment | `XMLHttpRequest` response status 200, subsequent authenticated same-origin `fetch` 200, 166,639 bytes, valid ZIP-like signature. **Not an automated Copilot archive export.** |

## RC1 browser acceptance test

1. Open **Groups in GIRM - Economic Control** in Copilot Free and run `copilot-thread-exporter-free.v6.0.0-rc1.js` in F12 Console. Use the actual full title if prompted.
2. Inspect generated HTML and JSONL: target is 98/98 positions, chronological messages, 7 recoverable images, diagrams/code preserved; compare the output with the browser visually. Check that `Archive integrity and attachment warning` names missing Word sources without claiming they are present in ZIP.
3. Inspect `manifest.json` inside ZIP: check recovered images and code file counts and that any Word not represented by validated bytes is recorded as unresolved. Verify that images inside ZIP have not been downsized just to satisfy the HTML 1600 px limit.

### Pass/fail criteria

- No unexplained missing, duplicate or reordered message indices.
- No title inferred from the *Project* instead of the *conversation*.
- ZIP manifests list **only actually embedded binaries** as recovered.
- Unavailable documents remain visible in HTML/JSONL/manifest without inventing download paths.
- No unsolicited file picker, requests for local original files, network uploads or claims that Word Online same-origin access solves Copilot cross-origin restrictions.
- No regression in 7 image recoveries and code-block handling.
- No non-English new UI prompts (chat-language content unchanged).

**Release decision:** if any criterion fails, fix on this branch and rerun the affected test. If passed, merge via the release PR and update the version in the documentation. Do not equate a JavaScript syntax check with live-browser validation.
