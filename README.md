# Copilot Thread Export — v6.0.0 Release Candidate

Unofficial, browser-console archiver for **Microsoft Copilot Free (web)**. No extension, Docker, external backend, or undocumented Microsoft API is required for its basic workflow. Microsoft 365 Copilot enterprise has a **separate legacy exporter** and is **not** covered by this release candidate.

> **Release status:** v6.0.0-rc1. The code has passed syntax and isolated ZIP-building checks; **real-browser regression testing of rc1 is still required** before replacing the stable `main` release.

## Run the Free-web exporter

1. Open the intended conversation on Copilot Free in a desktop browser.
2. Open F12 → **Console**. Copy and paste the entire contents of [copilot-thread-exporter-free.v6.0.0-rc1.js](copilot-thread-exporter-free.v6.0.0-rc1.js) and run it. If your browser warns about console pasting, read the code and explicitly allow pasting only if you trust it.
3. Leave the tab open while the exporter traverses the conversation. Confirm the **full conversation title** if Copilot does not expose a verifiable one, then answer the date prompts. The browser will download HTML and JSONL, and can offer an optional ZIP.

The exporter's **interface and prompts are in English**. Chat content is preserved in its original language.

## Archive contents

| Output | What it preserves | Important limitations |
| --- | --- | --- |
| HTML | Chronological observed messages, code/tables/diagrams, browser-rendered images and an integrity warning. Images larger than 1600 px are optimized for viewing. | Indexed coverage does not guarantee every virtualized body was fully mounted. |
| JSONL | Ordered messages, structure, provenance, title/date metadata, missing-attachment records, integrity diagnostics. | Does not embed large binary files. |
| Optional ZIP | Highest-resolution image **bytes available to the browser before HTML optimization**; code blocks as files; attached document bytes **only when truly downloaded and signature-validated**; `manifest.json`. | Images may be previews or re-encoded; do not assume they match an original upload. Original Office documents may be inaccessible. |

An empty-asset ZIP can still contain `manifest.json`. The manifest now sets `includes_documents` and `includes_code_blocks` **only when corresponding files were actually captured**.

### Important: chat attachments vs Project references

A Project can add document references to every conversation turn. A label such as “3 files” repeated in ten turns is **not** evidence of thirty distinct chat uploads.

The exporter reports Project context names in the HTML/JSONL. It **does not silently insert all Project documents into the ZIP**. It only offers an opt-in attempt when it has an actual browser-exposed candidate resource, and it does not treat a Word Online viewer link as a document download.

**OneDrive / Word Online:** In an isolated live experiment, the browser successfully fetched a 166,639-byte ODT from `word-edit.officeapps.live.com` using same-origin JavaScript (`200`, valid ZIP/ODT signature). **This does not establish an authorized binary transfer into JavaScript on `copilot.com`**. The Word Online-to-Copilot ZIP bridge is **not implemented** in v6.0.0-rc1. Save the original Word/Excel documents independently if you plan to delete the conversation or its Project.

Avoid uploading sensitive HAR files: they can contain authorization tokens, cookies and protected URLs.

## Validation before the stable release

See [VALIDATION.md](VALIDATION.md) for the two known test conversations and acceptance criteria. Keep the source conversations until you have reviewed their exported HTML and all required external attachments.

### Known limits

- Microsoft can change its DOM, virtual scrolling, reference panels and content security rules.
- Full title detection avoids uncertain Project names and instead asks the user when live UI evidence is insufficient.
- The archive is faithful to **accessible, observed browser content**; it is not a guarantee of a complete Microsoft account backup.
- Project context files may be viewable in the browser yet not retrievable as bytes from Copilot.
- Multiple downloads may need browser permission.

## Legacy versions

- [Copilot Free v3.6.9 (current stable main)](copilot-thread-exporter-free.v3.6.9.js)
- [Microsoft 365 Copilot v3.6](copilot-thread-exporter-365.v3.6.js)

Earlier experimental versions are kept on their separate branches.

## Security and maintenance

Never share raw chat exports, HAR logs, signed/download URLs, tokens, or corporate document content in public issues. For compatibility failures, [open a sanitized issue](https://github.com/010100100100011001000011/copilot-thread-export/issues) with the version, browser, symptoms and non-sensitive logs.

MIT licensed. Not affiliated with or endorsed by Microsoft.
