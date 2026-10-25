# v6.0.1 release validation

Evidence and regression checks. Private conversation/document titles are intentionally omitted from this public report.

## Browser tests

| Test case | Evidence | Outcome |
| --- | --- | --- |
| Short chat | 20/20 conversation positions | Complete numbered coverage, two external Project references recognized, no invented document bytes. |
| Long, rich chat | 98/98 conversation positions, 7 images | Complete numbered coverage; 7 image payloads in HTML and ZIP manifest; 11 external reference names tracked; 0 Office binary recoveries. |
| Formatting | 198 Plain Text blocks in v6.0.0 HTML/manifest | **v6.0.1** explicitly excludes all preformatted-text/diagram duplicates from ZIP while keeping them in HTML. All 198 real fixture blocks were reviewed against the conservative multi-command recognition; 0 qualified. |
| Title provenance | Short name typed into user title prompt | JSONL correctly reports `chat_title_source: user_confirmed`; a user-provided title is not independently verified. Full title must be supplied when prompted. |
| ZIP construction | Isolated mock-asset tests | ZIP central-directory entries and manifest validated with image, document and genuine code only; plain text does not create an entry. |
| Word Online, separate test | Authenticated same-origin ODT `HTTP 200` | 166,639 bytes and ZIP signature validated in Word Online context. Cross-origin integration into Copilot **not validated**. |

## Acceptance

- Archive is fully explicit about missing Office binaries; no fabricated download or false claim that a viewer constitutes a backup.
- Verified image binary count and references recorded in manifest, with warning that original upload bytes are not guaranteed.
- No missing numbered positions in tested chat. Body completeness must be inspected in browser.
- Original embedded rich text, diagrams and preformatted blocks not discarded.
- Plain Text blocks remain in HTML and create **no extra ZIP files**. Only real runnable source code or executable command sequences create code files.
- ZIP manifest file counts, `includes_documents`, `includes_code_blocks`, and `preformatted_text_files_created: 0` match actual entries.
- No local file picker and no network upload of conversation content.

## Residual limitations

The complete ZIP **binary from the final browser run was not submitted** for independent verification; the manifest is evidence of its intended contents, not proof of each byte. Version v6.0.1 has synthetic code-classification checks and a review of all 198 previous Plain Text samples, but no new full-browser ZIP was submitted yet. The capture engine and HTML formatting remain unchanged. Readers must review representative exported replies and retain critical original attachments before deleting a chat.

Future versions may investigate a separately authorized Word Online helper/bridge. This is outside the v6.0.1 scope.
