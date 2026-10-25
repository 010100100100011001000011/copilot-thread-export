# Copilot Thread Export — v6.0.1

Unofficial **browser-console exporter for Copilot Free (web)**. The Microsoft 365 Copilot exporter is a separate legacy script, not part of the v6 engine.

**Current stable version:** [copilot-thread-exporter-free.v6.0.1.js](copilot-thread-exporter-free.v6.0.1.js).

## Export a conversation

1. Open the intended Copilot Free chat on a desktop browser, then open **F12 → Console**.
2. Copy the entire contents of [copilot-thread-exporter-free.v6.0.1.js](copilot-thread-exporter-free.v6.0.1.js) into the console and execute it. Review code before accepting any browser “allow pasting” warning.
3. Leave the Copilot tab active during traversal. If asked, type the **full, current conversation title**, not just a short Project name. Confirm dates. HTML and JSONL download automatically; an optional ZIP is offered for recovered media/files.

Exporter controls/prompts are in **English**; original conversation languages remain unchanged. No local-file picker, external backend, Docker, browser extension, or upload of chat content is required.

## Archive outputs

| Output | Saved information |
| --- | --- |
| HTML | Observed chronological chat (rich replies, diagrams, tables and text), images optimized to at most 1600 px for display, and a prominent integrity/attachment notice. |
| JSONL | Indexed chronology, message data, title/date metadata, reference inventory, provenance, unresolved file records, and diagnostics. Large binaries are excluded. |
| Optional ZIP | Recoverable browser image bytes **before** HTML downscaling, actual accessible and signature-validated file binaries, substantive runnable source code or multi-command execution scripts only, and `manifest.json`. Diagrams, business-process descriptions and isolated snippets are kept **only in HTML**, not as duplicate `.txt` files. |

**Images in ZIP** are the highest-resolution **browser-accessible payloads**; they may still be thumbnails/previews or re-encoded versions, not the originals uploaded to Microsoft.

**Only actual code becomes a standalone file.** A recognized programming-language label alone is insufficient: substantive source structure is required. Multi-command terminal scripts are accepted (even if Copilot labels them Plain Text) when multiple executable commands are recognized. Single-line commands, small fragments, ASCII flowcharts, Markdown, pseudocode and process descriptions stay in the HTML and are **excluded from ZIP files**. The manifest reports actual code/doc/image files, including `preformatted_text_files_created: 0`.

## Attachments and Project context

File pills, Project context documents, and directly uploaded chat attachments are **not interchangeable**. Recurring labels such as “3 files” do not prove three new unique documents in each message. A file title shown under **Sources / References** may not establish which level of context originally supplied it.

The HTML and JSONL record visible document references. Binary files are added to ZIP **only if their bytes are successfully retrieved and validated**. Project-context resources are never silently included; an optional attempt is offered only when an actual candidate file URL is exposed, with an opt-in confirmation.

### OneDrive / Word Online limitation

A separate browser experiment confirmed that **same-origin JavaScript inside Word Online** could fetch an authenticated, complete **166,639-byte ODT** (`HTTP 200`). This does **not** mean JavaScript executing on Copilot Free can read OneDrive or Office cross-origin binary responses. An automatic transfer of Word Online document bytes to the Copilot ZIP is **not part of v6.0.1**. Opening a document in Word Online or saving a Word link is not a binary backup.

If your export lists unresolved Office files, download/retain them separately **before deleting the original conversation or Project**. Do not assume that an HTML/JSONL/ZIP archive is a complete Microsoft account export.

## Validation and scope

The previous live browser export confirmed **98/98 positions**, 7 embedded images, 11 externally referenced titles, 0 Office binaries and 198 plain-text/diagram blocks. **v6.0.1 corrects the remaining bug:** those 198 blocks no longer produce individual files in ZIP. An isolated review of the 198 captured blocks found **zero** qualifying multi-command scripts, and synthetic tests distinguish executable scripts from diagrams, prose, one-line commands and pseudocode. Conversation traversal and HTML rendering are unchanged.

**Test caveat:** the uploaded browser evidence was produced by v6.0.0 and included HTML, JSONL and the ZIP's `manifest.json`, but **not the entire ZIP binary**. The new v6.0.1 filter has isolated tests but has not yet received a new real-browser export. The ZIP writer was separately smoke-tested with binary fixtures and correct archive entries. An independent full binary ZIP inspection of that exact browser run was not performed. See [VALIDATION.md](VALIDATION.md).

### Key constraints

- UI/DOM virtualization may cause truncated reply bodies even when all message indices are present.
- Some metadata dates cannot be inferred from browser messages and must be user-confirmed.
- If title detection cannot verify the full chat name, the exporter asks rather than trusting a Project label.
- Browser policies may block multiple downloads.
- Project external resources can be viewable but not binary-accessible from Copilot.

## Previous versions

- [Copilot Free v6.0.0](copilot-thread-exporter-free.v6.0.0.js) (superseded: generated 198 redundant diagram/text files in the tested long chat)

## Legacy exporters

- [Copilot Free v3.6.9](copilot-thread-exporter-free.v3.6.9.js) (kept for rollback)
- [Microsoft 365 Copilot v3.6](copilot-thread-exporter-365.v3.6.js) (separate product/interface)

## Security, support and license

Never post a chat export, HAR, signed document link, cookie, token or confidential attachment in a public GitHub issue. For breakages, [open an issue](https://github.com/010100100100011001000011/copilot-thread-export/issues) with sanitized browser/version details and symptoms.

Unofficial community software; not affiliated with or supported by Microsoft. MIT license.
