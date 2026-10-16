import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA_VERSION = 1

export function createBotStore({ databasePath }) {
  if (typeof databasePath !== 'string' || databasePath.trim() === '') {
    throw new TypeError('databasePath must be a non-empty path')
  }
  const resolvedPath = path.resolve(databasePath)
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
  const db = new Database(resolvedPath)
  db.pragma('busy_timeout = 5000')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const version = db.pragma('user_version', { simple: true })
  if (version > SCHEMA_VERSION) {
    db.close()
    throw new Error(`Database schema version ${version} is newer than supported version ${SCHEMA_VERSION}`)
  }
  if (version < SCHEMA_VERSION) {
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS notes_chat_created_idx ON notes(chat_id, created_at_ms DESC, id DESC);
        CREATE TABLE IF NOT EXISTS reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          text TEXT NOT NULL,
          due_at_ms INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'expired')),
          next_attempt_at_ms INTEGER NOT NULL,
          lease_until_ms INTEGER,
          sent_at_ms INTEGER,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS reminders_chat_status_due_idx ON reminders(chat_id, status, due_at_ms, id);
        CREATE INDEX IF NOT EXISTS reminders_claim_idx ON reminders(status, due_at_ms, next_attempt_at_ms, lease_until_ms);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `)
    })
    migrate()
  }

  const insertNote = db.prepare('INSERT INTO notes (chat_id, text, created_at_ms) VALUES (?, ?, ?)')
  const getNote = db.prepare('SELECT id, chat_id AS chatId, text, created_at_ms AS createdAtMs FROM notes WHERE id = ? AND chat_id = ?')
  const noteRow = (row) => row && ({ ...row, id: Number(row.id), createdAtMs: Number(row.createdAtMs) })
  const insertReminder = db.prepare(`
    INSERT INTO reminders (chat_id, text, due_at_ms, created_at_ms, next_attempt_at_ms)
    VALUES (?, ?, ?, ?, ?)
  `)
  const reminderRow = (row) => row && ({
    ...row,
    id: Number(row.id),
    dueAtMs: Number(row.dueAtMs),
    createdAtMs: Number(row.createdAtMs),
    nextAttemptAtMs: Number(row.nextAttemptAtMs),
    leaseUntilMs: row.leaseUntilMs == null ? null : Number(row.leaseUntilMs),
    sentAtMs: row.sentAtMs == null ? null : Number(row.sentAtMs),
    attempts: Number(row.attempts),
  })
  const selectReminder = db.prepare(`
    SELECT id, chat_id AS chatId, text, due_at_ms AS dueAtMs,
      created_at_ms AS createdAtMs, status, next_attempt_at_ms AS nextAttemptAtMs,
      lease_until_ms AS leaseUntilMs, sent_at_ms AS sentAtMs, attempts, last_error AS lastError
    FROM reminders WHERE id = ?
  `)

  function close() {
    if (db.open) db.close()
  }

  function addNote({ chatId, text, createdAtMs }) {
    const result = insertNote.run(chatId, text, createdAtMs)
    return noteRow(getNote.get(result.lastInsertRowid, chatId))
  }

  function listNotes(chatId, limit = 20) {
    return db.prepare(`
      SELECT id, chat_id AS chatId, text, created_at_ms AS createdAtMs
      FROM notes WHERE chat_id = ? ORDER BY created_at_ms DESC, id DESC LIMIT ?
    `).all(chatId, boundedLimit(limit)).map(noteRow)
  }

  function searchNotes(chatId, query, limit = 20) {
    return db.prepare(`
      SELECT id, chat_id AS chatId, text, created_at_ms AS createdAtMs
      FROM notes WHERE chat_id = ? AND instr(text, ?) > 0
      ORDER BY created_at_ms DESC, id DESC LIMIT ?
    `).all(chatId, String(query), boundedLimit(limit)).map(noteRow)
  }

  function deleteNote(chatId, id) {
    return db.prepare('DELETE FROM notes WHERE chat_id = ? AND id = ?').run(chatId, id).changes > 0
  }

  function addReminder({ chatId, text, dueAtMs, createdAtMs }) {
    const result = insertReminder.run(chatId, text, dueAtMs, createdAtMs, dueAtMs)
    return reminderRow(selectReminder.get(result.lastInsertRowid))
  }

  function listPendingReminders(chatId) {
    return db.prepare(`
      SELECT id, chat_id AS chatId, text, due_at_ms AS dueAtMs,
        created_at_ms AS createdAtMs, status, next_attempt_at_ms AS nextAttemptAtMs,
        lease_until_ms AS leaseUntilMs, sent_at_ms AS sentAtMs, attempts, last_error AS lastError
      FROM reminders WHERE chat_id = ? AND status IN ('pending', 'sending')
      ORDER BY due_at_ms ASC, id ASC
    `).all(chatId).map(reminderRow)
  }

  function cancelReminder(chatId, id) {
    return db.prepare(`UPDATE reminders SET status = 'cancelled', lease_until_ms = NULL
      WHERE chat_id = ? AND id = ? AND status IN ('pending', 'sending')`).run(chatId, id).changes > 0
  }

  const claimDue = db.transaction(({ nowMs, retryBeforeMs, leaseUntilMs }) => {
    const due = db.prepare(`
      SELECT id FROM reminders
      WHERE (status = 'pending' AND due_at_ms <= @nowMs AND next_attempt_at_ms <= @nowMs)
         OR (status = 'sending' AND lease_until_ms <= @retryBeforeMs AND due_at_ms <= @nowMs)
      ORDER BY due_at_ms ASC, id ASC
    `).all({ nowMs, retryBeforeMs })
    const claim = db.prepare(`UPDATE reminders SET status = 'sending', lease_until_ms = ?, attempts = attempts + 1
      WHERE id = ? AND ((status = 'pending' AND due_at_ms <= ? AND next_attempt_at_ms <= ?)
      OR (status = 'sending' AND lease_until_ms <= ? AND due_at_ms <= ?))`)
    for (const { id } of due) claim.run(leaseUntilMs, id, nowMs, nowMs, retryBeforeMs, nowMs)
    return due.map(({ id }) => reminderRow(selectReminder.get(id)))
  })

  function claimDueReminders(args) {
    return claimDue(args)
  }

  function markReminderSent(id, sentAtMs) {
    return db.prepare(`UPDATE reminders SET status = 'sent', sent_at_ms = ?, lease_until_ms = NULL, last_error = NULL
      WHERE id = ? AND status = 'sending'`).run(sentAtMs, id).changes > 0
  }

  function retryReminder(id, nextAttemptAtMs) {
    return db.prepare(`UPDATE reminders SET status = 'pending', next_attempt_at_ms = ?, lease_until_ms = NULL
      WHERE id = ? AND status = 'sending'`).run(nextAttemptAtMs, id).changes > 0
  }

  function expireReminder(id) {
    return db.prepare(`UPDATE reminders SET status = 'expired', lease_until_ms = NULL
      WHERE id = ? AND status IN ('pending', 'sending')`).run(id).changes > 0
  }

  function expireOverdueReminders(beforeMs) {
    return db.prepare(`UPDATE reminders SET status = 'expired', lease_until_ms = NULL
      WHERE due_at_ms < ? AND status IN ('pending', 'sending')`).run(beforeMs).changes
  }

  return {
    close,
    addNote,
    listNotes,
    searchNotes,
    deleteNote,
    addReminder,
    listPendingReminders,
    cancelReminder,
    claimDueReminders,
    markReminderSent,
    retryReminder,
    expireReminder,
    expireOverdueReminders,
  }
}

function boundedLimit(limit) {
  const value = Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 20
  return Math.max(1, Math.min(value, 100))
}
