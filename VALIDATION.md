# v6.0.0 release validation

Evidence and regression checks. Private conversation/document titles are intentionally omitted from this public report.

## Browser tests

| Test case | Evidence | Outcome |
| --- | --- | --- |
| Short chat | 20/20 conversation positions | Complete numbered coverage, two external Project references recognized, no invented document bytes. |
| Long, rich chat | 98/98 conversation positions, 7 images | Complete numbered coverage; 7 image payloads in HTML and ZIP manifest; 11 external reference names tracked; 0 Office binary recoveries. |
| Formatting | 198 Plain Text blocks in HTML/manifest | Valid plain text/diagram material; initially misclassified as code. Corrected in final code: these are labeled `preformatted_text`, saved as `.txt`, and not counted as programming-code blocks. |
| Title provenance | Short name typed into user title prompt | JSONL correctly reports `chat_title_source: user_confirmed`; a user-provided title is not independently verified. Full title must be supplied when prompted. |
| ZIP construction | Isolated mock-asset tests | ZIP central-directory entries and manifest validated with image, document, genuine code and preformatted text; manifest feature flags reflect actual contents. |
| Word Online, separate test | Authenticated same-origin ODT `HTTP 200` | 166,639 bytes and ZIP signature validated in Word Online context. Cross-origin integration into Copilot **not validated**. |

## Acceptance

- Archive is fully explicit about missing Office binaries; no fabricated download or false claim that a viewer constitutes a backup.
- Verified image binary count and references recorded in manifest, with warning that original upload bytes are not guaranteed.
- No missing numbered positions in tested chat. Body completeness must be inspected in browser.
- Original embedded rich text, diagrams and preformatted blocks not discarded.
- Plain Text blocks categorized separately from executable code; stored as files, not silently dropped.
- Zip manifest actual file counts, `includes_documents`, `includes_code_blocks`, `includes_preformatted_text` are based on written entries.
- No local file picker and no network upload of conversation content.

## Residual limitations

The complete ZIP **binary from the final browser run was not submitted** for independent verification; the manifest is evidence of its intended contents, not proof of each byte. Final-version text/code categorization has isolated structural checks but no additional full browser regression because it is post-capture classification only. Readers must review representative exported replies and retain critical original attachments before deleting a chat.

Future versions may investigate a separately authorized Word Online helper/bridge. This is outside the v6.0.0 scope.
