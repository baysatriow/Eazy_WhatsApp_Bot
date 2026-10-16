import { normalizeMessageContent } from '@whiskeysockets/baileys'
import { isCommandAllowed } from './access-control.js'

const MAX_TEXT_LENGTH = 2000
const MAX_REPLY_LENGTH = 4000
const LIST_LIMIT = 20

function normalizeUserJid(jid) {
  if (typeof jid !== 'string') return null
  const match = jid.match(/^(\d+)(?::\d+)?@(s\.whatsapp\.net|c\.us|lid)$/)
  return match ? `${match[1]}@${match[2] === 'c.us' ? 's.whatsapp.net' : match[2]}` : null
}

function readText(message) {
  const content = normalizeMessageContent(message?.message)
  if (!content || typeof content !== 'object') return null
  // Read only the current message, never quoted text or quoted mentions.
  const body = content.extendedTextMessage ?? content.imageMessage ??
    content.videoMessage ?? content.documentMessage
  const text = content.conversation ?? body?.text ?? body?.caption
  if (typeof text !== 'string') return null
  const mentions = Array.isArray(body?.contextInfo?.mentionedJid)
    ? body.contextInfo.mentionedJid.filter((jid) => typeof jid === 'string')
    : []
  return { text, mentions }
}

function removeBotMentions(text, mentions, botJids) {
  const tokens = new Set(mentions
    .filter((jid) => botJids.has(normalizeUserJid(jid)))
    .map((jid) => normalizeUserJid(jid).split('@')[0]))
  return text.replace(/(^|\s)@(\d+)(?=\s|$)/g, (match, space, number) => (
    tokens.has(number) ? space : match
  )).trim()
}

function exactId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function localParts(formatter, milliseconds) {
  return Object.fromEntries(formatter.formatToParts(milliseconds)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]))
}

function parseFutureLocalTime(date, time, formatter, nowMs) {
  const match = `${date} ${time}`.match(/^([1-9]\d{3})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const localUtc = Date.UTC(year, month - 1, day, hour, minute)
  const calendar = new Date(localUtc)
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null

  // Collect offsets on both sides of a timezone transition. Round-tripping
  // rejects a skipped local minute and multiple matches reject a repeated one.
  const offsets = new Set()
  for (let hours = -48; hours <= 48; hours += 6) {
    const probeMs = localUtc + hours * 3600000
    const parts = localParts(formatter, probeMs)
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - probeMs)
  }
  const candidates = [...offsets].map((offset) => localUtc - offset).filter((candidate) => {
    const parts = localParts(formatter, candidate)
    return parts.year === year && parts.month === month && parts.day === day &&
      parts.hour === hour && parts.minute === minute
  })
  return candidates.length === 1 && candidates[0] > nowMs ? candidates[0] : null
}

function boundedList(title, rows, renderRow, emptyMessage) {
  if (rows.length === 0) return emptyMessage
  let text = title
  const visible = rows.slice(0, LIST_LIMIT)
  for (const row of visible) {
    // Keep space for the truncation hint, including for unusually long notes.
    const entry = renderRow(row)
    if (text.length + entry.length + 100 > MAX_REPLY_LENGTH) {
      return `${text}\nDaftar dipotong agar balasan tetap singkat.`
    }
    text += `\n${entry}`
  }
  if (rows.length > LIST_LIMIT) text += `\nMenampilkan ${LIST_LIMIT} jadwal terdekat.`
  return text
}

export function createCommandHandler({ config, store }) {
  const timeZone = config.timeZone ?? 'Asia/Jakarta'
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const zoneLabel = timeZone === 'Asia/Jakarta' ? 'WIB' : timeZone
  const formatTime = (dueAtMs) => `${formatter.format(dueAtMs)} ${zoneLabel}`
  const preview = (text) => String(text).replace(/\s+/g, ' ').slice(0, 140)

  return async function handleMessage({ sock, message }) {
    const chatId = message?.key?.remoteJid
    if (message?.key?.fromMe || typeof chatId !== 'string' ||
      !/^\d+(?:-\d+)?@(g\.us|s\.whatsapp\.net|c\.us|lid)$/.test(chatId)) return
    const incoming = readText(message)
    if (!incoming) return
    const botJids = new Set([sock?.user?.id, sock?.user?.lid, sock?.user?.phoneNumber]
      .map(normalizeUserJid).filter(Boolean))
    const authMessage = {
      key: message.key,
      message: { extendedTextMessage: { contextInfo: { mentionedJid: incoming.mentions.map((jid) => normalizeUserJid(jid)).filter(Boolean) } } },
    }
    // Try each *known* identity of the connected bot; PN and LID numbers are
    // never treated as interchangeable merely because their digits match.
    const identities = botJids.size ? [...botJids] : [undefined]
    if (!identities.some((botJid) => isCommandAllowed(authMessage, { ...config, botJid }))) return
    const text = removeBotMentions(incoming.text, incoming.mentions, botJids)
    const parsed = text.match(/^\/(\S+)(?:\s+([\s\S]*))?$/)
    if (!parsed) return
    const command = parsed[1].toLowerCase()
    const args = (parsed[2] ?? '').trim()
    const reply = (response) => sock.sendMessage(chatId, { text: response })
    const validText = () => args.length > 0 && args.length <= MAX_TEXT_LENGTH

    switch (command) {
      case 'bantuan':
        await reply([
          'Perintah bot (data hanya untuk chat ini):',
          '/catat <teks>\n/catatan\n/cari <kata>\n/hapus-catatan <id>',
          `/ingat YYYY-MM-DD HH:mm <pesan> (${zoneLabel})`,
          '/jadwal\n/batal-jadwal <id>\n/tag-semua <pesan> (grup, jika diaktifkan)',
          `Teks maksimal ${MAX_TEXT_LENGTH} karakter. Daftar menampilkan hingga ${LIST_LIMIT} hasil.`,
        ].join('\n'))
        break
      case 'catat': {
        if (!validText()) return reply(`/catat <teks> (1–${MAX_TEXT_LENGTH} karakter)`)
        const note = store.addNote({ chatId, text: args, createdAtMs: Date.now() })
        await reply(`Catatan #${note.id} tersimpan.`)
        break
      }
      case 'catatan':
        await reply(boundedList('Catatan chat ini (hingga 20 terbaru):', store.listNotes(chatId, LIST_LIMIT),
          (note) => `#${note.id}: ${preview(note.text)}`, 'Belum ada catatan di chat ini.'))
        break
      case 'cari':
        if (!validText()) return reply(`/cari <kata> (1–${MAX_TEXT_LENGTH} karakter)`)
        await reply(boundedList('Hasil pencarian di chat ini (hingga 20 terbaru):', store.searchNotes(chatId, args, LIST_LIMIT),
          (note) => `#${note.id}: ${preview(note.text)}`, 'Tidak ada catatan yang cocok di chat ini.'))
        break
      case 'hapus-catatan': {
        const id = exactId(args)
        if (id === null) return reply('/hapus-catatan <id> (ID angka lengkap)')
        await reply(store.deleteNote(chatId, id) ? `Catatan #${id} dihapus.` : `Catatan #${id} tidak ditemukan di chat ini.`)
        break
      }
      case 'ingat': {
        const schedule = args.match(/^(\S+) (\S+)\s+([\s\S]+)$/)
        const nowMs = Date.now()
        const dueAtMs = schedule && parseFutureLocalTime(schedule[1], schedule[2], formatter, nowMs)
        const reminderText = schedule?.[3].trim() ?? ''
        if (!dueAtMs || !reminderText || reminderText.length > MAX_TEXT_LENGTH) {
          return reply(`/ingat YYYY-MM-DD HH:mm <pesan> (${zoneLabel}). Gunakan waktu masa depan yang valid dan tidak ambigu; pesan 1–${MAX_TEXT_LENGTH} karakter.`)
        }
        const reminder = store.addReminder({ chatId, text: reminderText, dueAtMs, createdAtMs: nowMs })
        await reply(`Pengingat #${reminder.id} tersimpan untuk ${formatTime(dueAtMs)}.`)
        break
      }
      case 'jadwal':
        await reply(boundedList('Jadwal chat ini:', store.listPendingReminders(chatId),
          (reminder) => `#${reminder.id} | ${formatTime(reminder.dueAtMs)} | ${preview(reminder.text)}`,
          'Belum ada jadwal aktif di chat ini.'))
        break
      case 'batal-jadwal': {
        const id = exactId(args)
        if (id === null) return reply('/batal-jadwal <id> (ID angka lengkap)')
        await reply(store.cancelReminder(chatId, id) ? `Jadwal #${id} dibatalkan.` : `Jadwal #${id} tidak ditemukan atau sudah selesai di chat ini.`)
        break
      }
      case 'tag-semua':
        if (!chatId.endsWith('@g.us')) return reply('/tag-semua hanya tersedia di grup.')
        if (config.tagAllEnabled !== true) return reply('/tag-semua belum diaktifkan oleh pemilik bot.')
        if (!validText()) return reply(`/tag-semua <pesan> (1–${MAX_TEXT_LENGTH} karakter)`)
        try {
          await sock.sendMessage(chatId, { text: args, mentionAll: true })
        } catch {
          await reply('Gagal mengirim @all. Periksa dukungan akun/grup dan izin admin bot.')
        }
        break
      default:
        // Unknown commands and regular messages have no side effects.
        break
    }
  }
}
