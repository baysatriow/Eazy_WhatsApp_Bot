import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let dotenvLoaded = false

const DEFAULT_DATABASE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'eazy-whatsapp-bot.sqlite')

function loadDotenvOnce() {
  if (dotenvLoaded) return
  dotenvLoaded = true
  dotenv.config()
}

function parseAllowedNumbers(value) {
  if (typeof value !== 'string' || value.trim() === '') return new Set()
  const entries = value.split(',').map((entry) => entry.trim())
  // A partly valid allowlist is still unusable: a typo must not silently
  // change who can issue commands.
  if (entries.some((entry) => !/^[1-9]\d{7,14}$/.test(entry))) return new Set()
  return new Set(entries)
}

function parseAllowedGroups(value) {
  if (typeof value !== 'string' || value.trim() === '') return new Set()
  const entries = value.split(',').map((entry) => entry.trim())
  // An invalid non-empty group list must not turn into unrestricted access.
  if (entries.some((entry) => !/^\d+(?:-\d+)?@g\.us$/.test(entry))) return new Set(['__invalid_group_allowlist__'])
  return new Set(entries)
}

export function loadConfig(environment = process.env) {
  loadDotenvOnce()
  return {
    allowedNumbers: parseAllowedNumbers(environment.BOT_ALLOWED_NUMBERS),
    allowedGroups: parseAllowedGroups(environment.BOT_ALLOWED_GROUPS),
    tagAllEnabled: String(environment.BOT_TAG_ALL_ENABLED ?? '').trim().toLowerCase() === 'true',
    timeZone: typeof environment.BOT_TIME_ZONE === 'string' && environment.BOT_TIME_ZONE.trim()
      ? environment.BOT_TIME_ZONE.trim()
      : 'Asia/Jakarta',
    databasePath: typeof environment.BOT_DATABASE_PATH === 'string' && environment.BOT_DATABASE_PATH.trim()
      ? path.resolve(environment.BOT_DATABASE_PATH.trim())
      : DEFAULT_DATABASE_PATH,
    logIncoming: String(environment.BOT_LOG_INCOMING ?? 'true').trim().toLowerCase() !== 'false',
  }
}
