# Standalone WhatsApp Incoming Chat Logger

**Date:** 2026-10-15  
**Status:** Awaiting written-spec review

## Goal

Create a small standalone Node.js command-line app in this workspace so the user can link a WhatsApp account with a QR code and observe new incoming chats while the process is running. The app is an inbox logger, not an auto-responder or a web service.

## User requirements

- Log incoming messages from both individual chats and groups.
- Show each message in the terminal as it arrives.
- Keep a local, readable log after the process exits.
- Pair the account interactively with a QR code on first run and reuse the saved session on later runs.
- Do not send replies, download media, or replay old history as new incoming messages.
- Leave WhatsApp login to the user.

## Proposed design

Use the current `@whiskeysockets/baileys` package in a minimal Node.js ESM project. On startup, load Baileys' file-based multi-file authentication state and create a socket. Print a QR code to the terminal when pairing is needed, save credential updates, and report connection state in concise human-readable messages.

Listen for `messages.upsert` events and accept only `notify` events. Skip messages authored by the linked account. For every remaining message, write a short human-readable line to the terminal and append one JSON object to a daily JSONL file under `logs/`. Include the event time, chat JID, sender name and sender ID when present, message type, and text or caption when available. For media without text, record its type without downloading the media. Keep timestamps machine-readable in the file and show terminal times in WIB.

Use `auth_info_baileys/` for the local session and `logs/` for chat records. Both paths, along with `node_modules/`, are excluded from Git. The README will document installation, running, QR pairing, where logs are saved, and how to remove the saved session to pair again.

On a transient disconnect, reconnect and continue logging. If WhatsApp reports that the account has been logged out, stop reconnecting and tell the user to remove the local session and scan a new QR code. Handle Ctrl+C cleanly so the socket and log file are closed.

## Project shape

- `package.json` and lockfile: Node.js ESM metadata, supported Node version, dependencies, and `npm start` command.
- `src/index.js`: socket lifecycle, pairing, event subscription, reconnects, and shutdown.
- `src/message-log.js`: normalize supported message fields and write terminal/JSONL records.
- `.gitignore`: exclude dependencies, linked-device credentials, and chat logs.
- `README.md`: setup and operator instructions.

The first implementation will target Node.js 20 or newer. Dependencies will be pinned by the generated lockfile. No database, HTTP server, dashboard, environment secrets, or media storage is needed for this local workflow.

## Data and privacy

The log contains chat message text and identifiers and should be treated as private. Keep it local and out of version control. The WhatsApp session folder contains long-lived authentication keys and must also stay local and out of version control. The app does not mark messages read, send messages, or download attachments.

## Error handling

- Show pairing instructions when a QR code is emitted.
- Save updated credentials so a successful pairing survives process restarts.
- Retry recoverable connection closures without creating multiple active sockets.
- Stop retrying on an explicit logged-out state and explain the local re-pairing step.
- If an individual log write fails, report the error clearly and keep the process state understandable; avoid silently claiming the message was saved.

## Acceptance criteria

1. `npm install` completes on Node.js 20 or newer.
2. `npm start` starts the logger and displays a QR code when no saved session exists.
3. The user can scan that QR code and see a connected status without the app sending any message.
4. A new direct message and a new group message appear in the terminal and in the current day's JSONL file, with sender/chat context and readable content where available.
5. Messages authored by the linked account and history/backfill events are not logged as new incoming messages.
6. The saved session is reused after restart; a logged-out session produces a clear re-pairing instruction.
7. `auth_info_baileys/` and `logs/` are ignored by Git.

## Verification boundary

Before the user scans a QR code, installation and local startup can be checked without accessing their WhatsApp account. Live pairing and receipt of direct/group messages require the user to scan the QR code and send test messages; that live check will be reported separately from local startup verification.

## Reference documentation

- Baileys quickstart: <https://github.com/WhiskeySockets/docs/blob/main/quickstart.mdx>
- Baileys event model: <https://github.com/WhiskeySockets/docs/blob/main/concepts/events.mdx>
- Baileys session management: <https://github.com/WhiskeySockets/docs/blob/main/authentication/session-management.mdx>
