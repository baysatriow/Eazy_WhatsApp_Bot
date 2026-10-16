import { setTimeout as delay } from 'node:timers/promises'
import { Boom } from '@hapi/boom'
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { createMessageLogger } from './message-log.js'
import { loadConfig } from './config.js'
import { createBotStore } from './store.js'
import { createCommandHandler } from './command-handler.js'
import { startReminderScheduler } from './reminder-scheduler.js'

const reconnectController = new AbortController()
const pendingCommands = new Set()
let stopping = false
let activeSocket = null
let stopActiveSocket = null
let shutdownPromise = null
let credentialQueue = Promise.resolve()

function requestShutdown() {
  if (shutdownPromise) return shutdownPromise
  stopping = true
  activeSocket = null
  reconnectController.abort()
  console.log('\nMenghentikan Eazy_WhatsApp_Bot...')
  shutdownPromise = Promise.resolve().then(() => stopActiveSocket?.())
  return shutdownPromise
}

const onSignal = () => {
  void requestShutdown().catch(() => {
    console.error('Koneksi gagal ditutup dengan normal.')
    process.exitCode = 1
  })
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

function runSocketUntilClosed(state, saveCreds, { logger, handleMessage }) {
  console.log('Menghubungkan ke WhatsApp...')
  const socket = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    emitOwnEvents: false,
  })

  return new Promise((resolve) => {
    let finished = false
    let connected = false

    function finish(loggedOut = false) {
      if (finished) return
      finished = true
      if (activeSocket === socket) activeSocket = null
      socket.ev.off('messages.upsert', onMessages)
      socket.ev.off('creds.update', onCredentials)
      socket.ev.off('connection.update', onConnection)
      stopActiveSocket = null
      resolve({ loggedOut, connected })
    }

    function onCredentials() {
      credentialQueue = credentialQueue.then(() => saveCreds()).catch(() => {
        console.error('Sesi gagal disimpan. Periksa izin folder auth_info_baileys/.')
        process.exitCode = 1
      })
    }

    function onMessages({ type, messages }) {
      if (stopping || finished || type !== 'notify') return
      for (const message of messages) {
        if (stopping || finished) break
        const chatId = message?.key?.remoteJid ?? ''
        if (message?.key?.fromMe || chatId.endsWith('@broadcast') || chatId.endsWith('@newsletter')) continue
        // Logging and commands have separate error boundaries: one failing
        // must not prevent the other from processing the same incoming message.
        if (logger) {
          try {
            void logger.logIncoming(message).catch(() => {
              console.error('Pesan masuk gagal disimpan. Periksa ruang disk dan izin folder logs/.')
            })
          } catch {
            console.error('Pesan masuk tidak dapat dicatat.')
          }
        }
        if (activeSocket === socket) {
          const command = Promise.resolve().then(() => handleMessage({ sock: socket, message })).catch(() => {
            console.error('Perintah gagal diproses. Periksa koneksi dan izin folder database.')
          })
          pendingCommands.add(command)
          void command.then(() => pendingCommands.delete(command))
        }
      }
    }

    function onConnection({ connection, lastDisconnect, qr }) {
      if (finished) return
      if (qr && !stopping) {
        console.log('Pindai QR melalui WhatsApp > Perangkat tertaut > Tautkan perangkat:')
        qrcode.generate(qr, { small: true })
      }
      if (connection === 'open' && !stopping) {
        connected = true
        activeSocket = socket
        console.log('WhatsApp terhubung. Menunggu pesan pribadi dan grup...')
      }
      if (connection === 'close') {
        if (activeSocket === socket) activeSocket = null
        const error = lastDisconnect?.error
        const statusCode = error instanceof Boom ? error.output.statusCode : error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut
        if (loggedOut && !stopping) {
          console.log('Sesi WhatsApp keluar. Hapus folder auth_info_baileys/ lalu jalankan npm start untuk login kembali.')
        }
        finish(loggedOut)
      }
    }

    stopActiveSocket = async () => {
      if (activeSocket === socket) activeSocket = null
      try {
        await socket.end(new Error('Eazy_WhatsApp_Bot dihentikan'))
      } finally {
        finish()
      }
    }
    socket.ev.on('creds.update', onCredentials)
    socket.ev.on('messages.upsert', onMessages)
    socket.ev.on('connection.update', onConnection)
  })
}

async function cleanup(action, failureMessage) {
  try {
    await action()
  } catch {
    console.error(failureMessage)
    process.exitCode = 1
  }
}

async function main() {
  let logger = null
  let store = null
  let stopScheduler = null
  console.log('Eazy_WhatsApp_Bot | Catatan, pengingat, dan log pesan | Ctrl+C untuk berhenti')
  try {
    const config = loadConfig()
    if (config.logIncoming) logger = createMessageLogger({ directory: 'logs', timeZone: config.timeZone })
    store = createBotStore({ databasePath: config.databasePath })
    const handleMessage = createCommandHandler({ config, store })
    // One worker survives reconnects; only an open socket is exposed to it.
    stopScheduler = startReminderScheduler({ store, getSocket: () => activeSocket, timeZone: config.timeZone })
    if (config.allowedNumbers.size === 0) {
      console.log('Perintah dinonaktifkan: isi BOT_ALLOWED_NUMBERS dengan nomor yang valid di .env.')
    }
    console.log(`Log pesan masuk: ${config.logIncoming ? 'aktif' : 'nonaktif'}. Zona waktu: ${config.timeZone}.`)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
    let retryDelay = 1_000
    while (!stopping) {
      const outcome = await runSocketUntilClosed(state, saveCreds, { logger, handleMessage })
      await credentialQueue
      if (stopping || outcome.loggedOut) break
      if (outcome.connected) retryDelay = 1_000
      console.log(`Koneksi terputus. Menghubungkan kembali dalam ${retryDelay / 1_000} detik...`)
      try {
        await delay(retryDelay, undefined, { signal: reconnectController.signal })
      } catch (error) {
        if (error.name !== 'AbortError') throw error
      }
      retryDelay = Math.min(retryDelay * 2, 30_000)
    }
  } catch {
    console.error('Bot gagal berjalan. Periksa .env (termasuk zona waktu), dependensi, koneksi, dan izin folder sesi/database.')
    process.exitCode = 1
  } finally {
    stopping = true
    activeSocket = null
    reconnectController.abort()
    await cleanup(async () => {
      await shutdownPromise
      await stopActiveSocket?.()
    }, 'Koneksi gagal ditutup dengan normal.')
    await cleanup(async () => stopScheduler?.(), 'Worker pengingat gagal dihentikan dengan normal.')
    // Finish command writes and credential/log queues before closing storage.
    await Promise.allSettled([...pendingCommands])
    await cleanup(() => credentialQueue, 'Penyimpanan sesi gagal diselesaikan.')
    await cleanup(async () => logger?.close(), 'Penulisan log gagal diselesaikan.')
    await cleanup(async () => store?.close(), 'Database gagal ditutup dengan normal.')
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

await main()
