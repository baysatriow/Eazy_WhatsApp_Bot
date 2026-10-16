const CATCH_UP_MS = 24 * 60 * 60 * 1000
const LEASE_MS = 60 * 1000
const MAX_RETRY_MS = 5 * 60 * 1000

export function startReminderScheduler({ store, getSocket, timeZone = 'Asia/Jakarta', intervalMs = 15000 }) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1 || intervalMs > 2147483647) {
    throw new TypeError('intervalMs must be a positive timer interval')
  }
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const zoneLabel = timeZone === 'Asia/Jakarta' ? 'WIB' : timeZone
  let stopped = false
  let timer = null
  let inFlight = Promise.resolve()

  function retry(reminder) {
    // Retry until the global 24-hour expiry, with exponential backoff capped
    // at five minutes. Cap the exponent too, so attempts cannot overflow.
    const delayMs = Math.min(MAX_RETRY_MS, Math.max(intervalMs, 15000) * 2 ** Math.min(Math.max(reminder.attempts - 1, 0), 5))
    store.retryReminder(reminder.id, Date.now() + delayMs)
  }

  async function tick() {
    const nowMs = Date.now()
    // This must cover every chat, even when there is no connected socket.
    store.expireOverdueReminders(nowMs - CATCH_UP_MS)
    if (stopped) return
    const sock = getSocket()
    if (!sock) return
    const due = store.claimDueReminders({ nowMs, retryBeforeMs: nowMs, leaseUntilMs: nowMs + LEASE_MS })
    for (const reminder of due) {
      if (stopped || getSocket() !== sock) {
        // Release unsent claims after disconnect/shutdown for the next worker.
        store.retryReminder(reminder.id, Date.now())
        continue
      }
      const sendAtMs = Date.now()
      if (reminder.dueAtMs < sendAtMs - CATCH_UP_MS) {
        store.expireReminder(reminder.id)
        continue
      }
      // A cancellation can happen while an earlier send is awaiting WhatsApp.
      if (!store.listPendingReminders(reminder.chatId).some((row) => row.id === reminder.id && row.status === 'sending')) continue
      const late = reminder.dueAtMs < sendAtMs
      const label = late ? 'Pengingat terlambat' : 'Pengingat'
      const text = `${label} #${reminder.id}\nJadwal: ${formatter.format(reminder.dueAtMs)} ${zoneLabel}\n${reminder.text}`
      try {
        await sock.sendMessage(reminder.chatId, { text })
        // Persist only after send resolves; a crash in this gap may duplicate
        // delivery on recovery, preserving the documented at-least-once policy.
        store.markReminderSent(reminder.id, Date.now())
      } catch {
        retry(reminder)
        console.error(`Pengiriman pengingat #${reminder.id} gagal; akan dicoba kembali.`)
      }
    }
  }

  async function run() {
    try {
      await tick()
    } catch {
      // Keep the worker alive on transient database/socket errors. Unreleased
      // claims recover after their lease; never print private reminder text.
      console.error('Worker pengingat gagal memproses jadwal; akan mencoba kembali.')
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          inFlight = run()
        }, intervalMs)
        timer.unref?.()
      }
    }
  }

  // Schedule the first pass after the caller receives stop(). Later passes
  // start only after the previous pass completes, so sends never overlap.
  inFlight = Promise.resolve().then(run)
  return async function stop() {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    await inFlight
  }
}
