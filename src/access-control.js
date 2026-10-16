const PHONE_JID_SUFFIXES = ['@s.whatsapp.net', '@c.us']

function phoneFromJid(jid) {
  if (typeof jid !== 'string') return null
  const suffix = PHONE_JID_SUFFIXES.find((candidate) => jid.endsWith(candidate))
  if (!suffix) return null
  const match = jid.slice(0, -suffix.length).match(/^([1-9]\d{7,14})(?::\d+)?$/)
  return match ? match[1] : null
}

function collectContextInfo(message) {
  const found = []
  const seen = new Set()
  function visit(value, depth) {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (value.contextInfo && typeof value.contextInfo === 'object') found.push(value.contextInfo)
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'contextInfo') visit(child, depth + 1)
    }
  }
  visit(message?.message, 0)
  return found
}

function wasBotMentioned(message, botJid) {
  if (typeof botJid !== 'string' || !botJid) return false
  const botNumber = phoneFromJid(botJid)
  return collectContextInfo(message).some((contextInfo) => {
    const mentions = Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : []
    return mentions.some((jid) => jid === botJid || (botNumber !== null && phoneFromJid(jid) === botNumber))
  })
}

function senderNumberCandidates(key, isGroup) {
  const candidates = isGroup
    ? [key.participant, key.participantAlt]
    : [key.remoteJid, key.remoteJidAlt]
  return new Set(candidates.map(phoneFromJid).filter(Boolean))
}

export function isCommandAllowed(message, {
  allowedNumbers,
  allowedGroups,
  botJid,
} = {}) {
  const key = message?.key
  const chatId = key?.remoteJid
  if (typeof chatId !== 'string' || !(allowedNumbers instanceof Set) || allowedNumbers.size === 0) return false

  const isGroup = chatId.endsWith('@g.us')
  if (isGroup && allowedGroups instanceof Set && allowedGroups.size > 0 && !allowedGroups.has(chatId)) return false
  if (isGroup && !wasBotMentioned(message, botJid)) return false

  const candidates = senderNumberCandidates(key, isGroup)
  // LID identities are deliberately not interpreted as phone numbers. A
  // group participantAlt is accepted only when it resolves to a valid PN JID.
  return [...candidates].some((number) => allowedNumbers.has(number))
}
