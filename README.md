# Copilot Thread Export — v6.0.0

Unofficial **browser-console exporter for Copilot Free (web)**. The Microsoft 365 Copilot exporter is a separate legacy script, not part of the v6 engine.

**Current stable version:** [copilot-thread-exporter-free.v6.0.0.js](copilot-thread-exporter-free.v6.0.0.js).

## Export a conversation

1. Open the intended Copilot Free chat on a desktop browser, then open **F12 → Console**.
2. Copy the entire contents of [copilot-thread-exporter-free.v6.0.0.js](copilot-thread-exporter-free.v6.0.0.js) into the console and execute it. Review code before accepting any browser “allow pasting” warning.
3. Leave the Copilot tab active during traversal. If asked, type the **full, current conversation title**, not just a short Project name. Confirm dates. HTML and JSONL download automatically; an optional ZIP is offered for recovered media/files.

Exporter controls/prompts are in **English**; original conversation languages remain unchanged. No local-file picker, external backend, Docker, browser extension, or upload of chat content is required.

## Archive outputs

| Output | Saved information |
| --- | --- |
| HTML | Observed chronological chat (rich replies, diagrams, tables and text), images optimized to at most 1600 px for display, and a prominent integrity/attachment notice. |
| JSONL | Indexed chronology, message data, title/date metadata, reference inventory, provenance, unresolved file records, and diagnostics. Large binaries are excluded. |
| Optional ZIP | Recoverable browser image bytes **before** HTML downscaling, actual accessible and signature-validated file binaries, preserved preformatted text/ASCII diagrams (`.txt`), genuine code blocks when detected, and `manifest.json`. |

**Images in ZIP** are the highest-resolution **browser-accessible payloads**; they may still be thumbnails/previews or re-encoded versions, not the originals uploaded to Microsoft.

**Plain Text blocks are not automatically code.** The ZIP stores such material under `position_N/preformatted/` and marks it as `preformatted_text`; recognized programming languages are stored under `position_N/code/` and marked as `code`. The manifest distinguishes both counts and reports `includes_documents`, `includes_code_blocks` and `includes_preformatted_text` from files **actually written**, never merely planned.

## Attachments and Project context

File pills, Project context documents, and directly uploaded chat attachments are **not interchangeable**. Recurring labels such as “3 files” do not prove three new unique documents in each message. A file title shown under **Sources / References** may not establish which level of context originally supplied it.

The HTML and JSONL record visible document references. Binary files are added to ZIP **only if their bytes are successfully retrieved and validated**. Project-context resources are never silently included; an optional attempt is offered only when an actual candidate file URL is exposed, with an opt-in confirmation.

### OneDrive / Word Online limitation

A separate browser experiment confirmed that **same-origin JavaScript inside Word Online** could fetch an authenticated, complete **166,639-byte ODT** (`HTTP 200`). This does **not** mean JavaScript executing on Copilot Free can read OneDrive or Office cross-origin binary responses. An automatic transfer of Word Online document bytes to the Copilot ZIP is **not part of v6.0.0**. Opening a document in Word Online or saving a Word link is not a binary backup.

If your export lists unresolved Office files, download/retain them separately **before deleting the original conversation or Project**. Do not assume that an HTML/JSONL/ZIP archive is a complete Microsoft account export.

## Validation and scope

The release was tested with two real Copilot Free conversations on earlier and RC versions: a **98-position** complex conversation with **7 images**, and a **20-position** conversation with linked Project references. A full RC browser export confirmed **98/98 positions**, 7 embedded images, 11 externally referenced titles, and the preservation of 198 preformatted text/diagram blocks. The exporter initially called these blocks “code”; the final release corrects their classification without changing message traversal.

**Test caveat:** the uploaded browser evidence included HTML, JSONL and the ZIP's `manifest.json`, but **not the entire ZIP binary**. The ZIP writer was separately smoke-tested with binary fixtures and correct archive entries. An independent full binary ZIP inspection of that exact browser run was not performed. See [VALIDATION.md](VALIDATION.md).

### Key constraints

- UI/DOM virtualization may cause truncated reply bodies even when all message indices are present.
- Some metadata dates cannot be inferred from browser messages and must be user-confirmed.
- If title detection cannot verify the full chat name, the exporter asks rather than trusting a Project label.
- Browser policies may block multiple downloads.
- Project external resources can be viewable but not binary-accessible from Copilot.

## Legacy exporters

- [Copilot Free v3.6.9](copilot-thread-exporter-free.v3.6.9.js) (kept for rollback)
- [Microsoft 365 Copilot v3.6](copilot-thread-exporter-365.v3.6.js) (separate product/interface)

## Security, support and license

Never post a chat export, HAR, signed document link, cookie, token or confidential attachment in a public GitHub issue. For breakages, [open an issue](https://github.com/010100100100011001000011/copilot-thread-export/issues) with sanitized browser/version details and symptoms.

Unofficial community software; not affiliated with or supported by Microsoft. MIT license.
