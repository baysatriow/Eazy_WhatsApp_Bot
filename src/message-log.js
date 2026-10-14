import { appendFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  getContentType,
  isHostedLidUser,
  isHostedPnUser,
  isJidGroup,
  isLidUser,
  isPnUser,
  normalizeMessageContent,
} from '@whiskeysockets/baileys'

const singleLine = (value) => String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')

export function createMessageLogger({ directory = 'logs', timeZone = 'Asia/Jakarta' } = {}) {
  const logDirectory = resolve(directory)
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  let queue = Promise.resolve()

  function logIncoming(message) {
    const chatId = message?.key?.remoteJid
    const isGroup = typeof chatId === 'string' && isJidGroup(chatId)
    const isPersonal = typeof chatId === 'string' && (
      isPnUser(chatId) || isLidUser(chatId) || isHostedPnUser(chatId) || isHostedLidUser(chatId)
    )
    if (message?.key?.fromMe || (!isGroup && !isPersonal) || !chatId.split('@')[0]) {
      return Promise.resolve(null)
    }

    const content = normalizeMessageContent(message.message)
    const type = getContentType(content)
    const text = content?.conversation ??
      content?.extendedTextMessage?.text ??
      content?.imageMessage?.caption ??
      content?.videoMessage?.caption ??
      content?.documentMessage?.caption ??
      (type ? `[${type}]` : null)
    if (!type || text === null || (type === 'conversation' && text === '')) {
      return Promise.resolve(null)
    }

    const seconds = Number(message.messageTimestamp)
    let receivedAt = new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now())
    if (Number.isNaN(receivedAt.getTime())) receivedAt = new Date()
    const record = {
      timestamp: receivedAt.toISOString(),
      chatId,
      senderName: message.pushName ?? null,
      senderId: isGroup ? message.key.participant ?? null : message.key.participant ?? chatId,
      messageId: message.key.id ?? null,
      type,
      text,
    }
    const dateParts = Object.fromEntries(
      dateFormatter.formatToParts(receivedAt).map(({ type, value }) => [type, value]),
    )
    const filename = `incoming-${dateParts.year}-${dateParts.month}-${dateParts.day}.jsonl`
    const writePromise = queue.then(async () => {
      await mkdir(logDirectory, { recursive: true })
      await appendFile(resolve(logDirectory, filename), `${JSON.stringify(record)}\n`, 'utf8')
      const sender = record.senderName ?? record.senderId ?? 'Pengirim tidak diketahui'
      const zoneLabel = timeZone === 'Asia/Jakarta' ? 'WIB' : timeZone
      console.log(`[${timeFormatter.format(receivedAt)} ${zoneLabel}] [${isGroup ? 'Grup' : 'Pribadi'}] ${singleLine(sender)} (${singleLine(chatId)}): ${singleLine(text)}`)
      return record
    })
    queue = writePromise.catch(() => {})
    return writePromise
  }

  async function close() {
    await queue
  }

  return { logIncoming, close }
}
