import { setTimeout as delay } from 'node:timers/promises'
import { Boom } from '@hapi/boom'
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { createMessageLogger } from './message-log.js'

const logger = createMessageLogger({ directory: 'logs', timeZone: 'Asia/Jakarta' })
const reconnectController = new AbortController()
let stopping = false
let stopActiveSocket = null
let shutdownPromise = null
let credentialQueue = Promise.resolve()

function requestShutdown() {
  if (shutdownPromise) return shutdownPromise
  stopping = true
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

function runSocketUntilClosed(state, saveCreds) {
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
        try {
          void logger.logIncoming(message).catch(() => {
            console.error('Pesan masuk gagal disimpan. Periksa ruang disk dan izin folder logs/.')
          })
        } catch {
          console.error('Pesan masuk tidak dapat diproses.')
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
        console.log('WhatsApp terhubung. Menunggu pesan pribadi dan grup...')
      }
      if (connection === 'close') {
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

async function main() {
  console.log('Eazy_WhatsApp_Bot | Log pesan masuk | Ctrl+C untuk berhenti')
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
    let retryDelay = 1_000
    while (!stopping) {
      const outcome = await runSocketUntilClosed(state, saveCreds)
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
    console.error('Bot gagal berjalan. Periksa koneksi internet dan izin folder sesi.')
    process.exitCode = 1
  } finally {
    stopping = true
    reconnectController.abort()
    try {
      await shutdownPromise
      await stopActiveSocket?.()
    } finally {
      await credentialQueue
      await logger.close()
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
    }
  }
}

await main()
