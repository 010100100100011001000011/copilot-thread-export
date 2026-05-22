Overview

This repository contains two JavaScript console-based exporters that extract the full conversation history (thread) from Microsoft Copilot:

    Microsoft 365 Copilot (business/enterprise version)

    Copilot Free (public web version)

Both scripts run directly in the browser using F12 → Console, scroll the entire chat automatically, sanitize UI noise, and export:

    A clean HTML file (full thread, ordered, sanitized)

    A structured JSONL file (ideal for datasets, LLM training, backups)

Version: v3.6.9 — FastScan Ordered + Deep Sanitize + JSONL
Files

    copilot-thread-exporter-365.v3.6.9.js  
    Exporter for Microsoft 365 Copilot.

    copilot-thread-exporter-free.v3.6.9.js  
    Exporter for Copilot Free.

Features

    Full automatic scroll & capture

    Deduplication via SHA‑256

    Deep sanitization (removes UI buttons, badges, noise)

    Ordered output by vertical position

    Strict date prompts (thread created / last modified)

    HTML export with metadata

    JSONL export with structured rows

    Compatible with long threads (thousands of messages)

How to Use
1. Open your Copilot chat

Navigate to the conversation you want to export.
2. Open Developer Tools

Press:

    Windows: F12

    Mac: ⌥ + ⌘ + I

Go to the Console tab.
3. Paste the script

Open the .js file, copy its entire content, and paste it into the console.
4. Press Enter

The script will:

    Detect scrollable containers

    Auto‑scroll the entire thread

    Capture all messages

    Ask you to confirm two dates:

        Thread created

        Last modified

5. Download files

When finished, two files will automatically download:

    thread-export_v3.6_fastscan-ordered_YYYY-MM-DD_HH-MM-SS.html

    thread-export_v3.6_fastscan-ordered_YYYY-MM-DD_HH-MM-SS.jsonl

JSONL Format

Each line is a JSON object:
json

{
  "thread_id": "thread_2026-05-22T21-14-55Z",
  "order": 1,
  "role": "user",
  "text": "User message text…",
  "hash": "a1b2c3…",
  "yAbs": 12345,
  "exported_at": "2026-05-22T21:14:55.000Z",
  "thread_title": "Auto-detected title",
  "thread_created_date": "2026-05-20",
  "thread_last_modified_date": "2026-05-22",
  "page_title": "Copilot",
  "page_url": "https://copilot.microsoft.com/...",
  "capture_start": "2026-05-22T21:14:55.000Z",
  "capture_end": "2026-05-22T21:15:12.000Z"
}

Differences Between the Two Scripts
Feature	365 Version	Free Version
DOM selectors	Enterprise Copilot DOM	Public Copilot DOM
Code block detection	data-testid="markdown-reply"	div[data-content="ai-message"]
User message detection	fai-UserMessage__message	div[data-content="user-message"]
Behavior	Identical engine	Identical engine
Troubleshooting
Export stops early

Some pages load messages lazily. Scroll manually to the bottom once, then rerun the script.
HTML downloads but JSONL does not

Your browser may block multiple downloads.
Enable: Settings → Privacy → Allow multiple automatic downloads.
Dates keep asking again

Strict mode requires YYYY‑MM‑DD only.
License

This project is released under the MIT License.
See the LICENSE file for details.
Contributing

Pull requests are welcome.
If you want to add support for:

    Mobile Copilot

    Copilot for Windows

    Multi‑thread batch export

Open an issue or PR.
Author

Created by Tec — Milano, Italia.
If you use these tools, consider starring the repository ⭐
