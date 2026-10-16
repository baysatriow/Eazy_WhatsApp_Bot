# Eazy WhatsApp Group Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the incoming-message logger into an owner-restricted WhatsApp assistant with private/group notes, persistent reminders, and opt-in group `@all`.

**Architecture:** Keep Baileys connection and incoming-message logging in `src/index.js`. Add dedicated configuration/access-control and SQLite storage modules, then a command handler and reminder worker that are composed by the existing connection lifecycle.

**Tech Stack:** Node.js ESM, Baileys 7, dotenv, better-sqlite3 12, SQLite, JSONL logger.

**Spec:** `docs/superpowers/specs/2026-10-16-eazy-whatsapp-group-assistant-design.md`

## Global Constraints

- Runtime support remains `^20.9.0 || >=22.0.0`; Node 21 remains excluded.
- Empty or invalid `BOT_ALLOWED_NUMBERS` disables commands while incoming logging continues.
- Private commands require an allowlisted sender. Group commands require an allowlisted sender and an explicit bot mention.
- Unresolvable LID sender identities fail closed.
- Private notes and each group's notes/reminders stay isolated by chat ID.
- The `Asia/Jakarta` timezone is the default; persisted times are UTC.
- `BOT_TAG_ALL_ENABLED` defaults to `false`; unsupported `@all` never falls back to individual mentions.
- Keep existing live `notify` message logging for private and group chats.
- Keep `.env`, auth state, logs, and the SQLite database out of Git.
- README remains clear, has no AI references, and documents WhatsApp/Baileys limits.
- Commits use Conventional Commit subjects without co-author or attribution trailers.

## Review Focus

- Empty, malformed, or mixed-validity number allowlists must fail closed; private/LID identities must be compared without accepting unresolved LIDs (Task 1).
- Group commands from unauthorized senders, unmentioned messages, or excluded group IDs must do nothing while still allowing the logger to record messages (Tasks 1 and 2).
- A note search/delete/list must stay within the current chat and use explicit IDs for destructive actions (Tasks 1 and 2).
- Invalid, ambiguous, past, or non-existent local schedule times must not create a reminder (Task 2).
- Reminder restart/retry boundaries and unsupported @all responses must preserve the spec's at-least-once and no-mass-fallback behavior (Tasks 2 and 3).

---

### Task 1: Configuration, access control, and SQLite storage

**Files:**
- Create: `src/config.js`
- Create: `src/access-control.js`
- Create: `src/store.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `loadConfig(environment = process.env)` loads `.env` once and returns `allowedNumbers: Set<string>`, `allowedGroups: Set<string>`, `groupRequireMention: boolean`, `tagAllEnabled: boolean`, `timeZone: string`, `databasePath: string`, and `logIncoming: boolean`.
- `isCommandAllowed(message, { allowedNumbers, allowedGroups, groupRequireMention, botJid })` returns a boolean; compare phone-number JIDs and alternative PN JIDs, require a resolvable allowlisted number, and fail closed when a group sender is only an unresolved LID.
- `createBotStore({ databasePath })` returns `close()`, `addNote({ chatId, text, createdAtMs })`, `listNotes(chatId, limit = 20)`, `searchNotes(chatId, query, limit = 20)`, `deleteNote(chatId, id)`, `addReminder({ chatId, text, dueAtMs, createdAtMs })`, `listPendingReminders(chatId)`, `cancelReminder(chatId, id)`, `claimDueReminders({ nowMs, retryBeforeMs, leaseUntilMs })`, `markReminderSent(id, sentAtMs)`, `retryReminder(id, nextAttemptAtMs)`, `expireReminder(id)`, and `expireOverdueReminders(beforeMs)`.
- Note methods take `chatId` and never query across chat IDs; failed deletes/cancels return `false`. Reminder methods persist UTC epoch milliseconds and delivery state; claims return rows moved to `sending` in one transaction.
- `expireOverdueReminders(beforeMs)` globally expires pending/sending reminders whose due time is older than `beforeMs` and returns the number expired.

- [ ] Add `dotenv` and `better-sqlite3@^12.4.1` dependencies while preserving the current Node engine range.
- [ ] Implement `loadConfig` with a strict comma-separated phone allowlist; invalid entries make the command allowlist unusable, while `logIncoming` remains enabled by default.
- [ ] Implement `isCommandAllowed` for direct and group messages; enforce optional `BOT_ALLOWED_GROUPS`, explicit bot mentions in groups, and fail-closed LID handling.
- [ ] Implement one-file SQLite storage with parent-directory creation, busy timeout, WAL mode, versioned schema initialization, per-chat notes, and reminder retry/status fields.
- [ ] Implement global expiration of pending/sending reminders older than the scheduler's 24-hour recovery cutoff.
- [ ] Review the diff for allowlist parsing, cross-chat data isolation, SQLite error behavior, and compatibility with the declared Node releases.
- [ ] Commit as `feat: add secure configuration and sqlite storage`.

### Task 2: Commands and reminder delivery

**Files:**
- Create: `src/command-handler.js`
- Create: `src/reminder-scheduler.js`

**Interfaces:**
- `createCommandHandler({ config, store })` returns `handleMessage({ sock, message })`; it silently ignores unauthorized messages and non-command text.
- `startReminderScheduler({ store, getSocket, timeZone, intervalMs = 15000 })` returns an async `stop()` function; `getSocket()` returns the currently connected socket or `null`.
- Supported commands are `/bantuan`, `/catat`, `/catatan`, `/cari`, `/hapus-catatan`, `/ingat`, `/jadwal`, `/batal-jadwal`, and `/tag-semua`.

- [ ] Implement safe text extraction and command parsing after removing the explicit bot mention; only parse leading slash commands.
- [ ] Implement notes commands using only the current chat's records; bound list/search response sizes and require exact IDs for delete/cancel.
- [ ] Implement one-time reminders in the configured timezone, reject malformed/past local times, and keep each reminder bound to its originating chat.
- [ ] Implement a sequential scheduler with a 15-second default interval, a 24-hour catch-up window, overdue labeling, global expiry before claiming work, and retry of unsent due work.
- [ ] Implement `/tag-semua` only in groups when explicitly enabled; send with Baileys `mentionAll`, report failures in the source group, and never mass-mention individual members as fallback.
- [ ] Review the diff for privacy scope, command authorization, time parsing, scheduler retry semantics, and mention behavior.
- [ ] Commit as `feat: add notes reminders and group commands`.

### Task 3: Baileys lifecycle integration and user documentation

**Files:**
- Modify: `src/index.js`
- Modify: `.gitignore`
- Modify: `README.md`
- Create: `.env.example`

**Interfaces:**
- Initialize config/store once in `main`; preserve all existing live private/group log behavior unless `BOT_LOG_INCOMING=false`.
- Route each incoming `notify` message to logging and command handling independently so logger failures or command failures are reported without crashing the connection loop.
- Keep one reminder worker per process; make its active socket unavailable while disconnected and stop it before closing the database.

- [ ] Wire configuration, storage, command handling, and scheduler into the current connect/reconnect/shutdown lifecycle.
- [ ] Preserve QR login, self/status/newsletter filters, current JSONL format, and shutdown queue draining.
- [ ] Add `.env.example` with safe placeholders; ignore `.env*` while keeping `.env.example` tracked, and ignore `data/`.
- [ ] Rewrite the README setup, allowlist/group behavior, notes/reminders/`@all` commands, local data/backup guidance, and live-account verification boundary without AI references.
- [ ] Review the final diff for clean lifecycle handling, configuration/privacy documentation, and public-repository hygiene.
- [ ] Commit as `docs: document group assistant setup and commands`.
