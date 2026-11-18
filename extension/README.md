# Copilot Free + Office one-click archive — extension v0.2 (EXPERIMENTAL)

**Development branch, not a release. Do not replace the validated v6.0.1 console exporter or the working v0.1 Office bridge yet.**

## Implemented

- One extension button invokes the v6.0.1 Copilot crawler inside Chromium's **isolated extension world**; the user no longer pastes code into F12 or answers end-of-export title/date/ZIP prompts.
- One ZIP download per invocation: `conversation.html`, `conversation.jsonl`, `manifest.json`, browser-recovered images, genuine document binaries already accessible to the crawler, code files meeting v6.0.1's conservative source-code rules.
- Office's verified same-origin `request.odt` capture remains available while capture is enabled. **Already captured local ODT bytes** with an exact normalized Sources-panel title match are merged into that *same* ZIP without a separate original-ZIP picker. Stored hash is checked again. Original DOCX identity is **not** verified: manifest marks an ODT *alternative*, matching by title only.
- Source reference remains unresolved if the original is not recovered, even when an ODT alternative is included. No guessed download URLs, Graph APIs, cookies, tokens, telemetry, uploads or external backend.
- A bounded **20-minute** scan replaces the unbounded six-hour behavior in extension mode. Time budget, missing accessibility indices, and start-verification status are recorded; a partial archive is never asserted to be complete.
- Extension status is stored locally so the popup can close and reopen during a long export.

## Not implemented / tests still required

- **No automatic navigation from a Copilot Sources card to Word Online, nor unattended Word Online ODT creation/download.** A source that only displays a title (the 19-name fixture) still cannot be fetched. This is the principal remaining blocker to the user's full *one-click with files* requirement.
- The previously validated v0.1 bridge and this new v0.2 extension are **different extension installations**: their respective `chrome.storage.local` data are **not shared**. New installed v0.2 instances have no earlier ODT captures unless explicitly migrated with tested provenance controls.
- No live Avast Secure Browser browser test of v0.2 is claimed. Chrome may ask permission for automated downloads. A long-thread export still can be incomplete.
- An unpacked development build via Developer Mode is not a standard-user installation product. Reviewed store distribution is a separate requirement.

## For developers

Install the unpacked `extension/` directory of this feature branch as a separate *experimental* extension; keep the old bridge disabled during tests to avoid duplicate captures. Open a Copilot Free chat in the same browser session and press **Export conversation + available files**. A completed run offers a single `*_complete.zip`. Inspect `manifest.json` before treating the archive as a backup.

Office capture: Word Online's native, authorized ODT download emits an authenticated `request.odt`. The page's MAIN-world XHR hook re-fetches it from the same Office origin; the isolated relay retains verified bytes in extension local storage. **There is no cross-origin access from Copilot.** Data captured by the extension are local and may include sensitive documents; clear stored data after verifying the archive, or uninstall the experimental extension.

Static and synthetic ZIP regression: `node tests/extension-v0.2.test.cjs`. The test constructs a **synthetic 277-byte ODT**; it does not access real customer files or Microsoft credentials.

## Explicit acceptance gate for full automation

Do not label this feature complete until **one click** (after one-time installation) results in a real Copilot source opening, a real Word file being downloaded via the Office-origin integration without manual document actions, and its verified bytes appearing in the single final ZIP alongside the HTML, JSONL and an accurate provenance manifest. Test at least two distinct files and a blocked/unavailable source.
