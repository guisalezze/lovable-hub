import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createHmac } from 'crypto'
import qrcode from 'qrcode'

// ─── Supabase (service role) ──────────────────────────────────────────────────
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ─── Fastify ──────────────────────────────────────────────────────────────────
const app = Fastify({
  bodyLimit: 50 * 1024 * 1024, // 50 MB — disparo grande
  logger: true,
})

await app.register(cors, { origin: true })

// Raw body preservado antes do parse (obrigatório para validar assinatura Meta)
app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  req.rawBody = body
  try {
    done(null, JSON.parse(body.toString()))
  } catch (e) {
    done(e)
  }
})

// ─── Baileys session manager ──────────────────────────────────────────────────
// Map em memória: sessionId → { socket, qrCode, status, pendingSends[] }
const sessions = new Map()
// Jobs de broadcast WA oficial em memória
const broadcastJobs = new Map()

async function loadBaileys() {
  try {
    const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } =
      await import('@whiskeysockets/baileys')
    return { makeWASocket, DisconnectReason, fetchLatestBaileysVersion }
  } catch (e) {
    app.log.warn('Baileys não instalado ou erro ao importar: ' + e.message)
    return null
  }
}

// Auth state customizado no Supabase (sobrevive a rebuilds do container)
async function useSupabaseAuthState(sessionId) {
  async function readAuthState() {
    const { data } = await sb
      .from('whatsapp_sessions')
      .select('auth_state')
      .eq('session_id', sessionId)
      .maybeSingle()
    return data?.auth_state || null
  }

  async function writeAuthState(state) {
    await sb.from('whatsapp_sessions').upsert(
      { session_id: sessionId, auth_state: state, updated_at: new Date().toISOString() },
      { onConflict: 'session_id' }
    )
  }

  const savedState = await readAuthState()

  let authState = savedState || {
    creds: {},
    keys: {},
  }

  const savePendingRef = { timer: null, lastSave: 0 }
  const DEBOUNCE_MS = parseInt(process.env.AUTH_SAVE_DEBOUNCE_MS || '3000')
  const MAX_WAIT_MS = parseInt(process.env.AUTH_SAVE_MAX_WAIT_MS || '10000')

  function scheduleStateSave() {
    const now = Date.now()
    if (savePendingRef.timer) clearTimeout(savePendingRef.timer)
    // Forçar save se passou muito tempo desde o último
    if (now - savePendingRef.lastSave > MAX_WAIT_MS) {
      savePendingRef.lastSave = now
      writeAuthState(authState).catch(() => {})
      return
    }
    savePendingRef.timer = setTimeout(() => {
      savePendingRef.lastSave = Date.now()
      writeAuthState(authState).catch(() => {})
    }, DEBOUNCE_MS)
  }

  return {
    state: authState,
    saveCreds: scheduleStateSave,
  }
}

async function createBaileysSession(sessionId) {
  const baileys = await loadBaileys()
  if (!baileys) return null

  const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = baileys

  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useSupabaseAuthState(sessionId)

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){}, child(){ return this } },
  })

  const sessionData = {
    socket: sock,
    qrCode: null,
    status: 'connecting',
    pendingSends: [],
  }
  sessions.set(sessionId, sessionData)

  await sb.from('whatsapp_sessions').upsert(
    { session_id: sessionId, status: 'connecting', updated_at: new Date().toISOString() },
    { onConflict: 'session_id' }
  )

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    const session = sessions.get(sessionId)
    if (!session) return

    if (qr) {
      session.qrCode = await qrcode.toDataURL(qr)
      session.status = 'qr_pending'
      await sb.from('whatsapp_sessions').update(
        { status: 'qr_pending', updated_at: new Date().toISOString() }
      ).eq('session_id', sessionId)
    }

    if (connection === 'open') {
      session.status = 'connected'
      session.qrCode = null
      await sb.from('whatsapp_sessions').update({
        status: 'connected',
        phone_number: sock.user?.id?.split(':')[0] || null,
        display_name: sock.user?.name || null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('session_id', sessionId)
      app.log.info(`Baileys session ${sessionId} connected`)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const { Boom } = await import('@hapi/boom')
      const shouldReconnect = code !== DisconnectReason.loggedOut

      session.status = 'disconnected'
      await sb.from('whatsapp_sessions').update(
        { status: 'disconnected', updated_at: new Date().toISOString() }
      ).eq('session_id', sessionId)

      if (shouldReconnect) {
        app.log.info(`Baileys session ${sessionId} disconnected, reconnecting...`)
        setTimeout(() => createBaileysSession(sessionId), 5000)
      } else {
        app.log.warn(`Baileys session ${sessionId} logged out`)
        sessions.delete(sessionId)
        // Limpar auth state
        await sb.from('whatsapp_sessions').update(
          { auth_state: null, status: 'disconnected', updated_at: new Date().toISOString() }
        ).eq('session_id', sessionId)
      }
    }
  })

  return sock
}

// Recarregar sessões existentes ao iniciar
async function bootBaileySessions() {
  const { data: dbSessions } = await sb
    .from('whatsapp_sessions')
    .select('session_id, auth_state')
    .not('auth_state', 'is', null)

  if (!dbSessions?.length) return
  app.log.info(`Reconectando ${dbSessions.length} sessão(ões) Baileys...`)
  for (const s of dbSessions) {
    await createBaileysSession(s.session_id)
    await new Promise(r => setTimeout(r, 1500)) // pequeno delay entre sessões
  }
}

// ─── Email scheduler (30s) ────────────────────────────────────────────────────
async function runEmailScheduler() {
  try {
    const now = new Date().toISOString()
    // Lock atômico: só pega campanhas que ainda estão 'scheduled'
    const { data: campaigns } = await sb
      .from('email_campaigns')
      .select('*, email_senders(*)')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .limit(5)

    for (const campaign of campaigns || []) {
      // Marcar como 'sending' antes de processar (previne duplo disparo)
      const { error: lockErr } = await sb
        .from('email_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id)
        .eq('status', 'scheduled') // CAS — só atualiza se ainda 'scheduled'

      if (lockErr) continue // Outro worker pegou

      try {
        await dispatchEmailCampaign(campaign)
      } catch (e) {
        await sb.from('email_campaigns').update({
          status: 'failed',
          error_message: e.message,
        }).eq('id', campaign.id)
        app.log.error('Email campaign failed: ' + e.message)
      }
    }
  } catch (e) {
    app.log.error('Email scheduler error: ' + e.message)
  }
}

async function dispatchEmailCampaign(campaign) {
  const sender = campaign.email_senders
  if (!sender?.brevo_api_key) throw new Error('Sender sem API key')

  // Resolver destinatários
  let recipients = []
  const meta = campaign.audience_meta || {}

  if (meta.type === 'captacao' && meta.list_id) {
    // Lista dinâmica: resolver NA HORA (inclui leads adicionados depois do agendamento)
    const { data: contacts } = await sb
      .from('dynamic_list_contacts')
      .select('email, name')
      .eq('list_id', meta.list_id)
    recipients = contacts || []
  } else {
    // paste ou rules: já congelado em pending_recipients
    recipients = campaign.pending_recipients || []
  }

  if (!recipients.length) {
    await sb.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: 0 }).eq('id', campaign.id)
    return
  }

  // Enviar via Brevo em lotes de 50
  let sentCount = 0
  const BATCH_SIZE = 50

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    for (const r of batch) {
      try {
        await sendBrevoEmail({
          apiKey: sender.brevo_api_key,
          fromEmail: sender.from_email,
          fromName: sender.display_name,
          replyTo: sender.reply_to,
          to: r.email,
          subject: campaign.subject,
          html: campaign.html,
        })
        await sb.from('email_events').insert({
          campaign_id: campaign.id,
          sender_id: sender.id,
          event_type: 'sent',
          email: r.email,
        })
        sentCount++
      } catch (e) {
        app.log.warn(`Email to ${r.email} failed: ${e.message}`)
      }
      await sleep(100) // Rate limit gentil
    }
  }

  await sb.from('email_campaigns').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_count: sentCount,
  }).eq('id', campaign.id)
}

async function sendBrevoEmail({ apiKey, fromEmail, fromName, replyTo, to, subject, html }) {
  const body = {
    sender: { email: fromEmail, name: fromName },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  }
  if (replyTo) body.replyTo = { email: replyTo }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Brevo error ${res.status}: ${err}`)
  }
  return res.json()
}

// ─── Group campaign scheduler (30s) ──────────────────────────────────────────
async function runGroupCampaignScheduler() {
  try {
    const now = new Date().toISOString()
    const { data: campaigns } = await sb
      .from('whatsapp_group_campaigns')
      .select('*, whatsapp_group_messages(*), whatsapp_group_targets(*)')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .limit(3)

    for (const campaign of campaigns || []) {
      const { error: lockErr } = await sb
        .from('whatsapp_group_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id)
        .eq('status', 'pending')

      if (lockErr) continue

      try {
        await dispatchGroupCampaign(campaign)
      } catch (e) {
        await sb.from('whatsapp_group_campaigns').update({ status: 'failed' }).eq('id', campaign.id)
        app.log.error('Group campaign failed: ' + e.message)
      }
    }
  } catch (e) {
    app.log.error('Group campaign scheduler error: ' + e.message)
  }
}

async function dispatchGroupCampaign(campaign) {
  const session = sessions.get(campaign.session_id)
  if (!session?.socket) throw new Error(`Sessão ${campaign.session_id} não conectada`)

  const messages = (campaign.whatsapp_group_messages || []).sort((a, b) => a.order_index - b.order_index)
  const targets = campaign.whatsapp_group_targets || []

  for (const target of targets) {
    try {
      for (const msg of messages) {
        await sendBaileysMessage(session.socket, target.group_jid, msg)
        if (msg.delay_ms > 0) await sleep(msg.delay_ms)
      }
      await sb.from('whatsapp_group_targets').update({
        sent: true,
        sent_at: new Date().toISOString(),
      }).eq('id', target.id)
    } catch (e) {
      await sb.from('whatsapp_group_targets').update({ error: e.message }).eq('id', target.id)
    }
    await sleep(2000) // Intervalo entre grupos
  }

  await sb.from('whatsapp_group_campaigns').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', campaign.id)
}

async function sendBaileysMessage(sock, jid, msg) {
  switch (msg.type) {
    case 'text':
      await sock.sendMessage(jid, { text: msg.content })
      break
    case 'image':
      await sock.sendMessage(jid, { image: { url: msg.media_url }, caption: msg.caption || '' })
      break
    case 'video':
      await sock.sendMessage(jid, { video: { url: msg.media_url }, caption: msg.caption || '' })
      break
    case 'audio':
      await sock.sendMessage(jid, { audio: { url: msg.media_url }, mimetype: 'audio/mp4' })
      break
    case 'document':
      await sock.sendMessage(jid, { document: { url: msg.media_url }, fileName: msg.caption || 'arquivo' })
      break
    default:
      await sock.sendMessage(jid, { text: msg.content || '' })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function verifyMetaSignature(rawBody, signature, appSecret) {
  if (!signature || !appSecret) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function verifyBrevoWebhook(rawBody, signature, webhookSecret) {
  if (!signature || !webhookSecret) return true // Brevo não exige assinatura por padrão
  try {
    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const result = []
  for (const line of lines) {
    // Parse respeitando aspas (campos com vírgula dentro)
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())
    if (fields.length >= 1) result.push(fields)
  }
  return result
}

function cleanPhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null // Descartar inválidos
  // Adicionar código do Brasil se não tiver
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  return digits
}

// ─── META CLOUD API helper ────────────────────────────────────────────────────
async function metaSendTemplate({ accessToken, phoneNumberId, to, templateName, languageCode, components }) {
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'pt_BR' },
      components: components || [],
    },
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Meta API error ${res.status}`)
  return data
}

async function metaSendText({ accessToken, phoneNumberId, to, text }) {
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Meta API error ${res.status}`)
  return data
}

async function metaMarkRead({ accessToken, phoneNumberId, messageId }) {
  await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  })
}

const META_ERROR_MAP = {
  '131047': 'Fora da janela de 24h — envie um template',
  '131026': 'Número não encontrado no WhatsApp',
  '131021': 'Número inválido',
  '132000': 'Template não encontrado ou não aprovado',
  '132001': 'Template com parâmetros incorretos',
  '133010': 'Número não registrado na Cloud API (registre com PIN)',
  '130429': 'Rate limit da Meta atingido — aguarde e tente novamente',
  '131000': 'Erro genérico da Meta — tente novamente',
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health
app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }))

// ─── Sessões Baileys ──────────────────────────────────────────────────────────
app.get('/sessions', async (req, reply) => {
  const { data, error } = await sb
    .from('whatsapp_sessions')
    .select('id, session_id, phone_number, display_name, status, connected_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return reply.status(500).send({ error: error.message })

  // Enriquecer com status em memória
  const enriched = (data || []).map(s => ({
    ...s,
    live_status: sessions.get(s.session_id)?.status || s.status,
  }))
  return enriched
})

app.post('/sessions', async (req, reply) => {
  const { session_id, name } = req.body || {}
  if (!session_id) return reply.status(400).send({ error: 'session_id obrigatório' })

  const { error } = await sb.from('whatsapp_sessions').upsert(
    { session_id, display_name: name || session_id, status: 'disconnected', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: 'session_id' }
  )
  if (error) return reply.status(500).send({ error: error.message })

  await createBaileysSession(session_id)
  return { ok: true, session_id }
})

app.delete('/sessions/:id', async (req, reply) => {
  const { id } = req.params
  const session = sessions.get(id)
  if (session?.socket) {
    try { await session.socket.logout() } catch {}
    sessions.delete(id)
  }
  await sb.from('whatsapp_sessions').update({
    status: 'disconnected', auth_state: null, updated_at: new Date().toISOString()
  }).eq('session_id', id)
  return { ok: true }
})

app.get('/sessions/:id/qr.png', async (req, reply) => {
  const session = sessions.get(req.params.id)
  if (!session) return reply.status(404).send({ error: 'Sessão não encontrada' })
  if (!session.qrCode) return reply.status(404).send({ error: 'QR não disponível', status: session.status })

  // Retorna base64 data URL
  return { qr: session.qrCode, status: session.status }
})

app.get('/sessions/:id/groups', async (req, reply) => {
  const session = sessions.get(req.params.id)
  if (!session?.socket) return reply.status(400).send({ error: 'Sessão não conectada' })
  try {
    const groups = await session.socket.groupFetchAllParticipating()
    const list = Object.values(groups).map(g => ({
      jid: g.id,
      name: g.subject,
      participants: g.participants?.length || 0,
    }))
    return list
  } catch (e) {
    return reply.status(500).send({ error: e.message })
  }
})

app.post('/sessions/:id/send', async (req, reply) => {
  const { id } = req.params
  const { phone, type = 'text', content, media_url, caption } = req.body || {}
  const session = sessions.get(id)
  if (!session?.socket) return reply.status(400).send({ error: 'Sessão não conectada' })

  const cleaned = cleanPhone(phone)
  if (!cleaned) return reply.status(400).send({ error: 'Telefone inválido' })

  const jid = cleaned + '@s.whatsapp.net'
  try {
    await sendBaileysMessage(session.socket, jid, { type, content, media_url, caption })
    return { ok: true }
  } catch (e) {
    return reply.status(500).send({ error: e.message })
  }
})

app.post('/sessions/:id/reconnect', async (req, reply) => {
  const { id } = req.params
  const existing = sessions.get(id)
  if (existing?.socket) {
    try { existing.socket.end(undefined) } catch {}
    sessions.delete(id)
  }
  await createBaileysSession(id)
  return { ok: true }
})

// SSE — status da conexão
app.get('/connect/:id', async (req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')

  const send = (data) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)

  const interval = setInterval(() => {
    const s = sessions.get(req.params.id)
    send({ status: s?.status || 'disconnected', qr: s?.qrCode || null })
  }, 2000)

  req.raw.on('close', () => clearInterval(interval))
  send({ status: sessions.get(req.params.id)?.status || 'disconnected' })
})

// ─── Campanhas de grupo ───────────────────────────────────────────────────────
app.get('/group-campaigns', async (req, reply) => {
  const { data, error } = await sb
    .from('whatsapp_group_campaigns')
    .select('*, whatsapp_group_targets(count)')
    .order('created_at', { ascending: false })
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/group-campaigns', async (req, reply) => {
  const { session_id, name, scheduled_at } = req.body || {}
  if (!session_id || !name) return reply.status(400).send({ error: 'session_id e name obrigatórios' })
  const { data, error } = await sb.from('whatsapp_group_campaigns').insert({
    session_id, name, scheduled_at, status: 'pending'
  }).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.patch('/group-campaigns/:id', async (req, reply) => {
  const { id } = req.params
  const { name, scheduled_at, status } = req.body || {}
  const { data, error } = await sb.from('whatsapp_group_campaigns')
    .update({ name, scheduled_at, status })
    .eq('id', id).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/group-campaigns/:id', async (req, reply) => {
  const { error } = await sb.from('whatsapp_group_campaigns').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.get('/group-campaigns/:id/groups', async (req, reply) => {
  const { data, error } = await sb.from('whatsapp_group_targets')
    .select('*').eq('campaign_id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.get('/group-campaigns/:id/messages', async (req, reply) => {
  const { data, error } = await sb.from('whatsapp_group_messages')
    .select('*').eq('campaign_id', req.params.id).order('order_index')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/group-campaigns/:id/messages', async (req, reply) => {
  const msg = { ...req.body, campaign_id: req.params.id }
  const { data, error } = await sb.from('whatsapp_group_messages').insert(msg).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.post('/group-campaigns/:id/messages/bulk', async (req, reply) => {
  const { messages } = req.body || {}
  if (!Array.isArray(messages)) return reply.status(400).send({ error: 'messages deve ser array' })
  const rows = messages.map((m, i) => ({ ...m, campaign_id: req.params.id, order_index: i }))
  const { data, error } = await sb.from('whatsapp_group_messages').insert(rows).select()
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.patch('/group-messages/:id', async (req, reply) => {
  const { data, error } = await sb.from('whatsapp_group_messages')
    .update(req.body).eq('id', req.params.id).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/group-messages/:id', async (req, reply) => {
  const { error } = await sb.from('whatsapp_group_messages').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.get('/group-campaigns/storage-usage', async (req, reply) => {
  const { data, error } = await sb.storage.from('group-media').list()
  if (error) return { used_bytes: 0, files: 0 }
  const total = (data || []).reduce((sum, f) => sum + (f.metadata?.size || 0), 0)
  return { used_bytes: total, files: data?.length || 0 }
})

// ─── Email Marketing ──────────────────────────────────────────────────────────
app.get('/email/senders', async (req, reply) => {
  const { data, error } = await sb.from('email_senders').select('id, from_email, display_name, reply_to, is_active, created_at').order('created_at')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/email/senders', async (req, reply) => {
  const { from_email, display_name, reply_to, brevo_api_key, webhook_secret } = req.body || {}
  if (!from_email || !display_name || !brevo_api_key) return reply.status(400).send({ error: 'from_email, display_name e brevo_api_key obrigatórios' })
  const { data, error } = await sb.from('email_senders').insert({ from_email, display_name, reply_to, brevo_api_key, webhook_secret }).select('id, from_email, display_name, reply_to, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.patch('/email/senders/:id', async (req, reply) => {
  const { from_email, display_name, reply_to, brevo_api_key, webhook_secret, is_active } = req.body || {}
  const { data, error } = await sb.from('email_senders').update({ from_email, display_name, reply_to, brevo_api_key, webhook_secret, is_active }).eq('id', req.params.id).select('id, from_email, display_name, reply_to, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/email/senders/:id', async (req, reply) => {
  const { error } = await sb.from('email_senders').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.post('/email/send', async (req, reply) => {
  const { sender_id, subject, html, recipients, audience_meta, scheduled_at } = req.body || {}
  if (!sender_id || !subject || !html) return reply.status(400).send({ error: 'sender_id, subject e html obrigatórios' })

  const { data: sender, error: sErr } = await sb.from('email_senders').select('*').eq('id', sender_id).single()
  if (sErr || !sender) return reply.status(404).send({ error: 'Remetente não encontrado' })

  if (scheduled_at) {
    // Agendar
    const schedDate = new Date(scheduled_at)
    if (schedDate <= new Date(Date.now() + 60000)) return reply.status(400).send({ error: 'scheduled_at deve ser pelo menos 1 min no futuro' })

    const meta = audience_meta || { type: 'paste' }
    // Congelar destinatários para paste/rules; null para captacao
    const frozen = meta.type === 'captacao' ? null : (recipients || [])

    const { data: campaign, error } = await sb.from('email_campaigns').insert({
      sender_id,
      subject,
      html,
      status: 'scheduled',
      scheduled_at,
      audience_meta: meta,
      pending_recipients: frozen,
      recipient_count: frozen ? frozen.length : null,
    }).select().single()
    if (error) return reply.status(500).send({ error: error.message })
    return { ok: true, scheduled: true, campaign_id: campaign.id }
  }

  // Disparo imediato
  const { data: campaign } = await sb.from('email_campaigns').insert({
    sender_id, subject, html, status: 'sending', audience_meta: audience_meta || { type: 'paste' },
    pending_recipients: recipients || [], recipient_count: (recipients || []).length,
  }).select().single()

  // Disparo em background
  dispatchEmailCampaign({ ...campaign, email_senders: sender }).catch(e => {
    sb.from('email_campaigns').update({ status: 'failed', error_message: e.message }).eq('id', campaign.id)
  })

  return { ok: true, campaign_id: campaign.id }
})

app.post('/email/test', async (req, reply) => {
  const { sender_id, subject, html, to } = req.body || {}
  if (!sender_id || !subject || !html || !to) return reply.status(400).send({ error: 'sender_id, subject, html e to obrigatórios' })
  const { data: sender } = await sb.from('email_senders').select('*').eq('id', sender_id).single()
  if (!sender) return reply.status(404).send({ error: 'Remetente não encontrado' })
  try {
    await sendBrevoEmail({ apiKey: sender.brevo_api_key, fromEmail: sender.from_email, fromName: sender.display_name, replyTo: sender.reply_to, to, subject: `[TESTE] ${subject}`, html })
    return { ok: true }
  } catch (e) {
    return reply.status(500).send({ error: e.message })
  }
})

app.get('/email/campaigns', async (req, reply) => {
  const { data, error } = await sb.from('email_campaigns')
    .select('*, email_senders(from_email, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.get('/email/campaigns/:id', async (req, reply) => {
  const { data, error } = await sb.from('email_campaigns')
    .select('*, email_senders(from_email, display_name)')
    .eq('id', req.params.id).single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.patch('/email/campaigns/:id', async (req, reply) => {
  const { subject, html, scheduled_at, audience_meta, pending_recipients } = req.body || {}
  const { data, error } = await sb.from('email_campaigns')
    .update({ subject, html, scheduled_at, audience_meta, pending_recipients, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('status', 'scheduled')
    .select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.post('/email/campaigns/:id/cancel', async (req, reply) => {
  const { error } = await sb.from('email_campaigns')
    .update({ status: 'cancelled' })
    .eq('id', req.params.id)
    .in('status', ['scheduled', 'draft'])
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

// Webhook Brevo (eventos: request, delivered, open, click, hard_bounce, spam, unsubscribe)
app.post('/email/webhook/:sender_id', async (req, reply) => {
  const { sender_id } = req.params
  const { data: sender } = await sb.from('email_senders').select('webhook_secret').eq('id', sender_id).single()

  // Validação opcional de assinatura
  const sig = req.headers['x-brevo-signature']
  if (sender?.webhook_secret && sig) {
    if (!verifyBrevoWebhook(req.rawBody, sig, sender.webhook_secret)) {
      return reply.status(401).send('Invalid signature')
    }
  }

  const event = req.body
  // Brevo pode enviar array ou objeto único
  const events = Array.isArray(event) ? event : [event]

  const typeMap = {
    'request': 'sent',
    'delivered': 'delivered',
    'open': 'opened',
    'click': 'clicked',
    'hard_bounce': 'bounced',
    'soft_bounce': 'bounced',
    'spam': 'complained',
    'unsubscribe': 'unsubscribed',
    'blocked': 'bounced',
  }

  for (const ev of events) {
    const mapped = typeMap[ev?.event]
    if (!mapped) continue

    const email = ev.email || ''
    const brevoMsgId = ev['message-id'] || ev.id?.toString() || null

    await sb.from('email_events').upsert({
      event_type: mapped,
      email,
      brevo_message_id: brevoMsgId,
      url: ev.link || null,
      sender_id,
    }, { onConflict: 'brevo_message_id', ignoreDuplicates: true })
  }

  return { ok: true }
})

app.get('/email/suppressions', async (req, reply) => {
  const { data, error } = await sb.from('email_events')
    .select('email')
    .in('event_type', ['bounced', 'complained', 'unsubscribed'])
  if (error) return reply.status(500).send({ error: error.message })
  const unique = [...new Set((data || []).map(e => e.email))]
  return unique.map(email => ({ email }))
})

// ─── WhatsApp Oficial ─────────────────────────────────────────────────────────
app.get('/api-oficial/accounts', async (req, reply) => {
  const { data, error } = await sb.from('whatsapp_api_accounts')
    .select('id, name, phone_number, phone_number_id, waba_id, is_active, created_at')
    .order('created_at')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/api-oficial/accounts', async (req, reply) => {
  const { name, phone_number, phone_number_id, waba_id, access_token, app_secret, verify_token } = req.body || {}
  if (!name || !phone_number_id || !waba_id || !access_token || !app_secret || !verify_token)
    return reply.status(400).send({ error: 'Campos obrigatórios: name, phone_number_id, waba_id, access_token, app_secret, verify_token' })
  const { data, error } = await sb.from('whatsapp_api_accounts').insert({ name, phone_number, phone_number_id, waba_id, access_token, app_secret, verify_token }).select('id, name, phone_number, phone_number_id, waba_id, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.put('/api-oficial/accounts/:id', async (req, reply) => {
  const { name, phone_number, phone_number_id, waba_id, access_token, app_secret, verify_token, is_active } = req.body || {}
  const { data, error } = await sb.from('whatsapp_api_accounts').update({ name, phone_number, phone_number_id, waba_id, access_token, app_secret, verify_token, is_active }).eq('id', req.params.id).select('id, name, phone_number, phone_number_id, waba_id, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/api-oficial/accounts/:id', async (req, reply) => {
  const { error } = await sb.from('whatsapp_api_accounts').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

// Templates
app.get('/api-oficial/accounts/:id/templates', async (req, reply) => {
  const { data, error } = await sb.from('wa_templates')
    .select('*').eq('account_id', req.params.id).order('name')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/api-oficial/accounts/:id/sync-templates', async (req, reply) => {
  const { data: account } = await sb.from('whatsapp_api_accounts').select('*').eq('id', req.params.id).single()
  if (!account) return reply.status(404).send({ error: 'Conta não encontrada' })

  const res = await fetch(`https://graph.facebook.com/v20.0/${account.waba_id}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  })
  if (!res.ok) return reply.status(500).send({ error: 'Erro ao buscar templates da Meta' })
  const { data: templates } = await res.json()

  const rows = (templates || []).map(t => ({
    account_id: req.params.id,
    template_id: t.id,
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
    body_preview: t.components?.find(c => c.type === 'BODY')?.text || '',
    components: t.components,
    synced_at: new Date().toISOString(),
  }))

  if (rows.length) {
    await sb.from('wa_templates').upsert(rows, { onConflict: 'account_id,name,language' })
  }

  return { ok: true, synced: rows.length }
})

// Flows (chatbot)
app.get('/api-oficial/accounts/:id/flows', async (req, reply) => {
  const { data, error } = await sb.from('wa_flows').select('*').eq('account_id', req.params.id).order('created_at')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/api-oficial/accounts/:id/flows', async (req, reply) => {
  const { name, trigger_keyword, nodes } = req.body || {}
  const { data, error } = await sb.from('wa_flows').insert({ account_id: req.params.id, name, trigger_keyword, nodes: nodes || [] }).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.put('/api-oficial/flows/:id', async (req, reply) => {
  const { name, trigger_keyword, nodes, is_active } = req.body || {}
  const { data, error } = await sb.from('wa_flows').update({ name, trigger_keyword, nodes, is_active }).eq('id', req.params.id).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/api-oficial/flows/:id', async (req, reply) => {
  const { error } = await sb.from('wa_flows').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

// Broadcast
app.post('/api-oficial/broadcast', async (req, reply) => {
  const { account_id, template_name, language_code, components, phones, list_tag } = req.body || {}
  if (!account_id || !template_name || !phones?.length) return reply.status(400).send({ error: 'account_id, template_name e phones obrigatórios' })

  const { data: account } = await sb.from('whatsapp_api_accounts').select('*').eq('id', account_id).single()
  if (!account) return reply.status(404).send({ error: 'Conta não encontrada' })

  const jobId = crypto.randomUUID()
  const cleanedPhones = phones.map(cleanPhone).filter(Boolean)
  broadcastJobs.set(jobId, { total: cleanedPhones.length, sent: 0, errors: [], status: 'running' })

  // Disparo em background
  ;(async () => {
    const job = broadcastJobs.get(jobId)
    for (const phone of cleanedPhones) {
      try {
        // Verificar opt-out
        const { data: contact } = await sb.from('wa_contacts').select('opt_out').eq('phone', phone).eq('account_id', account_id).maybeSingle()
        if (contact?.opt_out) { job.sent++; continue }

        await metaSendTemplate({ accessToken: account.access_token, phoneNumberId: account.phone_number_id, to: phone, templateName: template_name, languageCode: language_code || 'pt_BR', components })

        await sb.from('whatsapp_api_sends').insert({ account_id, phone, template_name, status: 'sent', list_tag })
        job.sent++
      } catch (e) {
        const errCode = e.message?.match(/\(#(\d+)\)/)?.[1]
        job.errors.push({ phone, error: e.message, code: errCode })
        await sb.from('whatsapp_api_sends').insert({ account_id, phone, template_name, status: 'failed', error_code: errCode, error_message: e.message, list_tag })
      }
      if (job.sent % 10 === 0) await sleep(1000) // Rate limit gentil
    }
    job.status = 'done'
    broadcastJobs.set(jobId, job)

    // Adicionar tag nos contatos se list_tag fornecida
    if (list_tag) {
      for (const phone of cleanedPhones) {
        await sb.from('wa_contacts').upsert({ account_id, phone, tags: [list_tag] }, { onConflict: 'account_id,phone' })
      }
    }
  })()

  return { job_id: jobId, total: cleanedPhones.length }
})

app.get('/api-oficial/broadcast/:jobId', async (req, reply) => {
  const job = broadcastJobs.get(req.params.jobId)
  if (!job) return reply.status(404).send({ error: 'Job não encontrado' })
  return job
})

app.get('/api-oficial/sends', async (req, reply) => {
  const { data, error } = await sb.from('whatsapp_api_sends')
    .select('*, whatsapp_api_accounts(name)')
    .order('sent_at', { ascending: false }).limit(100)
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.get('/api-oficial/sends-report', async (req, reply) => {
  const { data, error } = await sb.from('whatsapp_api_sends')
    .select('error_code, error_message, phone, template_name, sent_at')
    .eq('status', 'failed')
    .order('sent_at', { ascending: false }).limit(200)
  if (error) return reply.status(500).send({ error: error.message })

  const enriched = (data || []).map(r => ({
    ...r,
    explanation: META_ERROR_MAP[r.error_code] || r.error_message || 'Erro desconhecido',
  }))
  return enriched
})

// Conversas / Inbox
app.get('/api-oficial/conversations', async (req, reply) => {
  const { status, account_id } = req.query
  let query = sb.from('wa_conversations')
    .select('*, wa_contacts(phone, name, tags), whatsapp_api_accounts(name)')
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (status) query = query.eq('status', status)
  if (account_id) query = query.eq('account_id', account_id)
  const { data, error } = await query
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.get('/api-oficial/conversations/:id/messages', async (req, reply) => {
  const { data, error } = await sb.from('wa_messages')
    .select('*').eq('conversation_id', req.params.id)
    .order('created_at')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.get('/api-oficial/conversations/:id/notes', async (req, reply) => {
  const { data, error } = await sb.from('wa_internal_notes')
    .select('*, auth.users(email)').eq('conversation_id', req.params.id)
    .order('created_at')
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/api-oficial/conversations/:id/send', async (req, reply) => {
  const { text, template_name, language_code, components } = req.body || {}

  const { data: conv } = await sb.from('wa_conversations')
    .select('*, wa_contacts(phone), whatsapp_api_accounts(*)')
    .eq('id', req.params.id).single()
  if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

  const account = conv.whatsapp_api_accounts
  const phone = conv.wa_contacts.phone
  const now = new Date()
  const windowOpen = conv.window_expires_at && new Date(conv.window_expires_at) > now

  try {
    let msgId
    if (!windowOpen && !template_name) {
      return reply.status(400).send({ error: 'JANELA_FECHADA', msg: 'Janela de 24h expirada. Envie um template.' })
    }

    if (template_name) {
      const result = await metaSendTemplate({ accessToken: account.access_token, phoneNumberId: account.phone_number_id, to: phone, templateName: template_name, languageCode: language_code || 'pt_BR', components })
      msgId = result.messages?.[0]?.id
    } else {
      const result = await metaSendText({ accessToken: account.access_token, phoneNumberId: account.phone_number_id, to: phone, text })
      msgId = result.messages?.[0]?.id
    }

    const { data: msg } = await sb.from('wa_messages').insert({
      conversation_id: req.params.id,
      wa_message_id: msgId,
      direction: 'out',
      type: template_name ? 'template' : 'text',
      content: text || template_name,
    }).select().single()

    await sb.from('wa_conversations').update({ last_message_at: now.toISOString() }).eq('id', req.params.id)
    return msg
  } catch (e) {
    return reply.status(500).send({ error: e.message })
  }
})

app.post('/api-oficial/conversations/:id/assign', async (req, reply) => {
  const { agent_id } = req.body || {}
  const { error } = await sb.from('wa_conversations').update({ assigned_to: agent_id }).eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.post('/api-oficial/conversations/:id/release', async (req, reply) => {
  const { error } = await sb.from('wa_conversations').update({ assigned_to: null }).eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.post('/api-oficial/conversations/:id/status', async (req, reply) => {
  const { status } = req.body || {}
  const { error } = await sb.from('wa_conversations').update({ status }).eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.post('/api-oficial/conversations/:id/read', async (req, reply) => {
  const { data: msgs } = await sb.from('wa_messages')
    .select('wa_message_id, conversation_id')
    .eq('conversation_id', req.params.id)
    .eq('direction', 'in')
    .not('wa_message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (msgs?.[0]?.wa_message_id) {
    const { data: conv } = await sb.from('wa_conversations')
      .select('whatsapp_api_accounts(phone_number_id, access_token)')
      .eq('id', req.params.id).single()
    const account = conv?.whatsapp_api_accounts
    if (account) {
      await metaMarkRead({ accessToken: account.access_token, phoneNumberId: account.phone_number_id, messageId: msgs[0].wa_message_id }).catch(() => {})
    }
  }
  return { ok: true }
})

app.post('/api-oficial/conversations/:id/notes', async (req, reply) => {
  const { content, author_id } = req.body || {}
  if (!content) return reply.status(400).send({ error: 'content obrigatório' })
  const { data, error } = await sb.from('wa_internal_notes').insert({
    conversation_id: req.params.id, content, author_id
  }).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

// Webhook Meta
app.get('/whatsapp/webhook', async (req, reply) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query

  // Verificar contra todas as contas com verify_token
  const { data: accounts } = await sb.from('whatsapp_api_accounts').select('verify_token')
  const valid = accounts?.some(a => a.verify_token === token)

  if (mode === 'subscribe' && valid) {
    return reply.status(200).send(challenge)
  }
  return reply.status(403).send('Forbidden')
})

app.post('/whatsapp/webhook', async (req, reply) => {
  const signature = req.headers['x-hub-signature-256']
  const body = req.rawBody

  // Tentar validar com alguma das contas (identifica pela WABA)
  const wabaId = req.body?.entry?.[0]?.id
  const { data: account } = await sb.from('whatsapp_api_accounts')
    .select('*').eq('waba_id', wabaId).maybeSingle()

  if (account && signature) {
    if (!verifyMetaSignature(body, signature, account.app_secret)) {
      return reply.status(401).send('Invalid signature')
    }
  }

  // Processar eventos
  const entries = req.body?.entry || []
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue
      const { messages = [], statuses = [], contacts: metaContacts = [] } = change.value || {}

      for (const msg of messages) {
        // Idempotência
        const { error: dupErr } = await sb.from('wa_webhook_events').insert({
          account_id: account?.id,
          wa_message_id: msg.id,
          payload: msg,
        })
        if (dupErr) continue // Já processado

        const phone = msg.from
        const text = msg.text?.body || msg.caption || `[${msg.type}]`

        // Upsert contato
        const { data: contact } = await sb.from('wa_contacts').upsert(
          { account_id: account?.id, phone, name: metaContacts.find(c => c.wa_id === phone)?.profile?.name || null },
          { onConflict: 'account_id,phone' }
        ).select().single()

        // Upsert conversa
        const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const { data: conv } = await sb.from('wa_conversations').upsert(
          { account_id: account?.id, contact_id: contact?.id, status: 'open', last_message_at: new Date().toISOString(), window_expires_at: windowExpires },
          { onConflict: 'account_id,contact_id' }
        ).select().single()

        // Inserir mensagem
        await sb.from('wa_messages').insert({
          conversation_id: conv?.id,
          wa_message_id: msg.id,
          direction: 'in',
          type: msg.type,
          content: text,
          media_url: msg.image?.id || msg.video?.id || msg.document?.id || null,
        })

        // Verificar flows (chatbot por botão)
        if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
          const btnId = msg.interactive.button_reply?.id
          await processFlowTrigger(account, conv, contact, phone, btnId)
        }
      }

      // Atualizar status das mensagens outbound
      for (const status of statuses) {
        if (['sent', 'delivered', 'read', 'failed'].includes(status.status)) {
          await sb.from('wa_messages').update({ status: status.status }).eq('wa_message_id', status.id)
        }
      }
    }
  }

  return { ok: true }
})

async function processFlowTrigger(account, conv, contact, phone, buttonId) {
  if (!account) return
  const { data: flows } = await sb.from('wa_flows').select('*').eq('account_id', account.id).eq('is_active', true)
  const flow = flows?.find(f => {
    const nodes = f.nodes || []
    return nodes.some(n => n.button_id === buttonId || n.trigger === buttonId)
  })
  if (!flow) return

  const nodes = flow.nodes || []
  const triggerNode = nodes.find(n => n.button_id === buttonId || n.trigger === buttonId)
  if (!triggerNode?.responses) return

  for (const resp of triggerNode.responses) {
    if (resp.delay_ms) await sleep(resp.delay_ms)
    if (resp.type === 'text') {
      await metaSendText({ accessToken: account.access_token, phoneNumberId: account.phone_number_id, to: phone, text: resp.content })
    } else if (resp.type === 'template') {
      await metaSendTemplate({ accessToken: account.access_token, phoneNumberId: account.phone_number_id, to: phone, templateName: resp.template_name, languageCode: 'pt_BR' })
    }
    if (resp.action === 'opt_out') {
      await sb.from('wa_contacts').update({ opt_out: true }).eq('id', contact?.id)
    }
    if (resp.action === 'add_tag' && resp.tag) {
      await sb.from('wa_contacts').update({ tags: sb.raw(`tags || ARRAY['${resp.tag}']::text[]`) }).eq('id', contact?.id)
    }
    await sleep(500)
  }
}

// ─── Captação de Leads ────────────────────────────────────────────────────────
app.get('/dynamic-lists', async (req, reply) => {
  const { data, error } = await sb.from('dynamic_lists')
    .select('*, dynamic_list_contacts(count)')
    .order('created_at', { ascending: false })
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/dynamic-lists', async (req, reply) => {
  const { name, slug, description } = req.body || {}
  if (!name || !slug) return reply.status(400).send({ error: 'name e slug obrigatórios' })
  const { data, error } = await sb.from('dynamic_lists').insert({ name, slug: slug.toLowerCase().replace(/\s+/g, '-'), description }).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.get('/dynamic-lists/:id', async (req, reply) => {
  const { data, error } = await sb.from('dynamic_lists').select('*').eq('id', req.params.id).single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/dynamic-lists/:id', async (req, reply) => {
  const { error } = await sb.from('dynamic_lists').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.get('/dynamic-lists/:id/contacts', async (req, reply) => {
  const { page = 0, limit = 100 } = req.query
  const from = parseInt(page) * parseInt(limit)
  const to = from + parseInt(limit) - 1
  const { data, error } = await sb.from('dynamic_list_contacts')
    .select('*').eq('list_id', req.params.id)
    .order('added_at', { ascending: false })
    .range(from, to)
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/dynamic-lists/:id/contacts', async (req, reply) => {
  const { email, name, phone, source, payload } = req.body || {}
  if (!email) return reply.status(400).send({ error: 'email obrigatório' })
  const { data, error } = await sb.from('dynamic_list_contacts')
    .upsert({ list_id: req.params.id, email: email.toLowerCase(), name, phone, source, payload }, { onConflict: 'list_id,email', ignoreDuplicates: true })
    .select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/dynamic-lists/:id/contacts/:cid', async (req, reply) => {
  const { error } = await sb.from('dynamic_list_contacts').delete().eq('id', req.params.cid).eq('list_id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.get('/dynamic-lists/:id/export.csv', async (req, reply) => {
  // Paginar para pegar todos (PostgREST limita a 1000 por vez)
  let allContacts = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data } = await sb.from('dynamic_list_contacts')
      .select('email, name, phone, source, added_at')
      .eq('list_id', req.params.id)
      .order('added_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (!data?.length) break
    allContacts = allContacts.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }

  const header = 'email,name,phone,source,added_at'
  const rows = allContacts.map(c => `"${c.email}","${c.name || ''}","${c.phone || ''}","${c.source || ''}","${c.added_at || ''}"`)
  const csv = [header, ...rows].join('\n')

  reply.header('Content-Type', 'text/csv; charset=utf-8')
  reply.header('Content-Disposition', `attachment; filename="lista-${req.params.id}.csv"`)
  return reply.send(csv)
})

// Endpoint público (sem autenticação) — usado por n8n, Zapier, formulários
app.post('/lists/:slug/contacts', async (req, reply) => {
  const { slug } = req.params
  const { email, name, phone, source, ...extras } = req.body || {}
  if (!email) return reply.status(400).send({ error: 'email obrigatório' })

  const { data: list } = await sb.from('dynamic_lists').select('id').eq('slug', slug).maybeSingle()
  if (!list) return reply.status(404).send({ error: 'Lista não encontrada' })

  await sb.from('dynamic_list_contacts').upsert(
    { list_id: list.id, email: email.toLowerCase(), name, phone, source, payload: extras },
    { onConflict: 'list_id,email', ignoreDuplicates: true }
  )

  return reply.status(201).send({ ok: true })
})

// ─── Encurtador de Links ──────────────────────────────────────────────────────
app.get('/redirects', async (req, reply) => {
  const { data, error } = await sb.from('redirects').select('*').order('created_at', { ascending: false })
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/redirects', async (req, reply) => {
  const { slug, destinations, description } = req.body || {}
  if (!slug || !destinations?.length) return reply.status(400).send({ error: 'slug e destinations obrigatórios' })
  const { data, error } = await sb.from('redirects').insert({ slug, destinations, description }).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.put('/redirects/:id', async (req, reply) => {
  const { slug, destinations, description } = req.body || {}
  const { data, error } = await sb.from('redirects').update({ slug, destinations, description, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/redirects/:id', async (req, reply) => {
  const { error } = await sb.from('redirects').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

// Redirect (hot path — GET /r/:slug)
app.get('/r/:slug', async (req, reply) => {
  const { data: redirect } = await sb.from('redirects')
    .select('id, destinations, round_robin_index, hit_count')
    .eq('slug', req.params.slug).maybeSingle()

  if (!redirect || !redirect.destinations?.length) {
    return reply.status(404).send('Link não encontrado')
  }

  let dest
  if (redirect.destinations.length === 1) {
    dest = redirect.destinations[0]
  } else {
    // Round-robin
    const idx = (redirect.round_robin_index || 0) % redirect.destinations.length
    dest = redirect.destinations[idx]
    // Atualizar índice de forma não-bloqueante
    sb.from('redirects').update({
      round_robin_index: idx + 1,
      hit_count: (redirect.hit_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', redirect.id).then(() => {})
  }

  if (!redirect.destinations.length || redirect.destinations.length === 1) {
    sb.from('redirects').update({ hit_count: (redirect.hit_count || 0) + 1 }).eq('id', redirect.id).then(() => {})
  }

  return reply.redirect(302, dest)
})

// ─── Webhooks / Automações ────────────────────────────────────────────────────
app.get('/webhooks', async (req, reply) => {
  const { data, error } = await sb.from('webhooks').select('id, name, token, session_id, is_active, created_at').order('created_at', { ascending: false })
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/webhooks', async (req, reply) => {
  const { name, session_id, messages, initial_delay_ms, interval_ms } = req.body || {}
  if (!name || !session_id) return reply.status(400).send({ error: 'name e session_id obrigatórios' })
  const { data, error } = await sb.from('webhooks').insert({ name, session_id, messages: messages || [], initial_delay_ms: initial_delay_ms || 0, interval_ms: interval_ms || 1000 }).select('id, name, token, session_id, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.put('/webhooks/:id', async (req, reply) => {
  const { name, session_id, messages, initial_delay_ms, interval_ms, is_active } = req.body || {}
  const { data, error } = await sb.from('webhooks').update({ name, session_id, messages, initial_delay_ms, interval_ms, is_active }).eq('id', req.params.id).select('id, name, token, session_id, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/webhooks/:id', async (req, reply) => {
  const { error } = await sb.from('webhooks').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.get('/webhooks/:id/logs', async (req, reply) => {
  const { data, error } = await sb.from('webhook_logs').select('*').eq('webhook_id', req.params.id).order('triggered_at', { ascending: false }).limit(100)
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

// Endpoint público — recebe automação
app.post('/webhook/:token', async (req, reply) => {
  const { data: webhook } = await sb.from('webhooks').select('*').eq('token', req.params.token).eq('is_active', true).maybeSingle()
  if (!webhook) return reply.status(404).send({ error: 'Webhook não encontrado' })

  const payload = req.body || {}
  const phone = cleanPhone(payload.phone || payload.telefone || payload.celular || payload.whatsapp)

  // Criar log
  const { data: log } = await sb.from('webhook_logs').insert({
    webhook_id: webhook.id,
    payload,
    phone,
    status: 'pending',
  }).select().single()

  if (!phone) {
    await sb.from('webhook_logs').update({ status: 'error', error_message: 'Telefone não encontrado no payload' }).eq('id', log.id)
    return reply.status(400).send({ error: 'Telefone não encontrado no payload' })
  }

  // Disparar sequência em background
  ;(async () => {
    try {
      const session = sessions.get(webhook.session_id)
      if (!session?.socket) throw new Error(`Sessão ${webhook.session_id} não conectada`)

      const jid = phone + '@s.whatsapp.net'
      const msgs = webhook.messages || []

      if (webhook.initial_delay_ms > 0) await sleep(webhook.initial_delay_ms)

      for (const msg of msgs) {
        // Substituir variáveis do payload no texto
        const content = (msg.content || '').replace(/\{\{(\w+)\}\}/g, (_, key) => payload[key] || '')
        await sendBaileysMessage(session.socket, jid, { ...msg, content })
        await sleep(webhook.interval_ms || 1000)
      }

      await sb.from('webhook_logs').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', log.id)
    } catch (e) {
      await sb.from('webhook_logs').update({ status: 'error', error_message: e.message }).eq('id', log.id)
    }
  })()

  return reply.status(200).send({ ok: true, log_id: log.id })
})

// Reenviar um log específico
app.post('/webhooks/:webhookId/logs/:logId/resend', async (req, reply) => {
  const { data: log } = await sb.from('webhook_logs').select('*').eq('id', req.params.logId).single()
  if (!log) return reply.status(404).send({ error: 'Log não encontrado' })

  const { data: webhook } = await sb.from('webhooks').select('*').eq('id', req.params.webhookId).single()
  if (!webhook) return reply.status(404).send({ error: 'Webhook não encontrado' })

  const session = sessions.get(webhook.session_id)
  if (!session?.socket) return reply.status(400).send({ error: 'Sessão não conectada' })

  const phone = log.phone
  if (!phone) return reply.status(400).send({ error: 'Sem telefone no log' })

  await sb.from('webhook_logs').update({ status: 'pending' }).eq('id', log.id)

  ;(async () => {
    try {
      const jid = phone + '@s.whatsapp.net'
      const msgs = webhook.messages || []
      const payload = log.payload || {}
      if (webhook.initial_delay_ms > 0) await sleep(webhook.initial_delay_ms)
      for (const msg of msgs) {
        const content = (msg.content || '').replace(/\{\{(\w+)\}\}/g, (_, key) => payload[key] || '')
        await sendBaileysMessage(session.socket, jid, { ...msg, content })
        await sleep(webhook.interval_ms || 1000)
      }
      await sb.from('webhook_logs').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', log.id)
    } catch (e) {
      await sb.from('webhook_logs').update({ status: 'error', error_message: e.message }).eq('id', log.id)
    }
  })()

  return { ok: true }
})

// ─── PerfectPay ──────────────────────────────────────────────────────────────
app.get('/perfectpay-integrations', async (req, reply) => {
  const { data, error } = await sb.from('perfectpay_integrations')
    .select('id, name, token, dynamic_list_id, wa_session_id, wa_messages, wa_initial_delay_ms, wa_interval_ms, filter_products, only_approved, is_active, created_at')
    .order('created_at', { ascending: false })
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

app.post('/perfectpay-integrations', async (req, reply) => {
  const { name, dynamic_list_id, wa_session_id, wa_messages, wa_initial_delay_ms, wa_interval_ms, filter_products, only_approved } = req.body || {}
  if (!name) return reply.status(400).send({ error: 'name obrigatório' })
  const { data, error } = await sb.from('perfectpay_integrations').insert({
    name, dynamic_list_id, wa_session_id,
    wa_messages: wa_messages || [],
    wa_initial_delay_ms: wa_initial_delay_ms ?? 5000,
    wa_interval_ms: wa_interval_ms ?? 2000,
    filter_products: filter_products || [],
    only_approved: only_approved ?? true,
  }).select('id, name, token, dynamic_list_id, wa_session_id, wa_messages, wa_initial_delay_ms, wa_interval_ms, filter_products, only_approved, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.put('/perfectpay-integrations/:id', async (req, reply) => {
  const { name, dynamic_list_id, wa_session_id, wa_messages, wa_initial_delay_ms, wa_interval_ms, filter_products, only_approved, is_active } = req.body || {}
  const { data, error } = await sb.from('perfectpay_integrations').update({
    name, dynamic_list_id, wa_session_id, wa_messages, wa_initial_delay_ms, wa_interval_ms, filter_products, only_approved, is_active
  }).eq('id', req.params.id).select('id, name, token, dynamic_list_id, wa_session_id, wa_messages, wa_initial_delay_ms, wa_interval_ms, filter_products, only_approved, is_active, created_at').single()
  if (error) return reply.status(500).send({ error: error.message })
  return data
})

app.delete('/perfectpay-integrations/:id', async (req, reply) => {
  const { error } = await sb.from('perfectpay_integrations').delete().eq('id', req.params.id)
  if (error) return reply.status(500).send({ error: error.message })
  return { ok: true }
})

app.get('/perfectpay-integrations/:id/events', async (req, reply) => {
  const { data, error } = await sb.from('perfectpay_events')
    .select('*').eq('integration_id', req.params.id)
    .order('received_at', { ascending: false }).limit(100)
  if (error) return reply.status(500).send({ error: error.message })
  return data || []
})

// Webhook público — recebe eventos da PerfectPay
app.post('/webhook/perfectpay/:token', async (req, reply) => {
  const { data: integration } = await sb.from('perfectpay_integrations')
    .select('*').eq('token', req.params.token).eq('is_active', true).maybeSingle()

  if (!integration) return reply.status(404).send({ error: 'Integração não encontrada' })

  const payload = req.body || {}

  // Normalizar payload PerfectPay
  // PerfectPay envia campos no nível raiz
  const eventType = payload.sale_status || payload.status || payload.event || 'unknown'
  const buyerEmail = (payload.buyer?.email || payload.client_email || payload.email || '').toLowerCase()
  const buyerName = payload.buyer?.name || payload.client_name || payload.name || ''
  const buyerPhone = cleanPhone(payload.buyer?.phone || payload.client_phone || payload.phone || payload.whatsapp || '')
  const productName = payload.product?.name || payload.product_name || ''
  const saleAmount = parseFloat(payload.sale_amount || payload.amount || payload.total || 0) || 0
  const saleId = payload.sale_id || payload.id || payload.order_id || ''

  // Verificar filtro de status
  const isApproved = ['approved', 'sale_approved', 'complete', 'completed', 'paid'].includes(eventType.toLowerCase())
  if (integration.only_approved && !isApproved) {
    await sb.from('perfectpay_events').insert({
      integration_id: integration.id,
      event_type: eventType,
      buyer_email: buyerEmail,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      product_name: productName,
      sale_amount: saleAmount,
      sale_id: saleId,
      raw_payload: payload,
      status: 'skipped',
    })
    return reply.status(200).send({ ok: true, skipped: true, reason: 'not_approved' })
  }

  // Verificar filtro de produtos
  if (integration.filter_products?.length && productName) {
    const match = integration.filter_products.some(p =>
      productName.toLowerCase().includes(p.toLowerCase())
    )
    if (!match) {
      await sb.from('perfectpay_events').insert({
        integration_id: integration.id,
        event_type: eventType,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        product_name: productName,
        sale_amount: saleAmount,
        sale_id: saleId,
        raw_payload: payload,
        status: 'skipped',
      })
      return reply.status(200).send({ ok: true, skipped: true, reason: 'product_filtered' })
    }
  }

  // Registrar evento
  const { data: event } = await sb.from('perfectpay_events').insert({
    integration_id: integration.id,
    event_type: eventType,
    buyer_email: buyerEmail,
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    product_name: productName,
    sale_amount: saleAmount,
    sale_id: saleId,
    raw_payload: payload,
    status: 'processed',
  }).select().single()

  let errors = []

  // 1. Adicionar a lista dinâmica
  if (integration.dynamic_list_id && buyerEmail) {
    try {
      await sb.from('dynamic_list_contacts').upsert({
        list_id: integration.dynamic_list_id,
        email: buyerEmail,
        name: buyerName,
        phone: buyerPhone,
        source: 'perfectpay',
        payload: { product_name: productName, sale_amount: saleAmount, sale_id: saleId },
      }, { onConflict: 'list_id,email', ignoreDuplicates: false })
    } catch (e) {
      errors.push('lista: ' + e.message)
    }
  }

  // 2. Disparar sequência WA via Baileys
  let waSent = false
  if (integration.wa_session_id && buyerPhone && integration.wa_messages?.length) {
    ;(async () => {
      try {
        const session = sessions.get(integration.wa_session_id)
        if (!session?.socket) throw new Error(`Sessão ${integration.wa_session_id} não conectada`)

        const jid = buyerPhone + '@s.whatsapp.net'
        if (integration.wa_initial_delay_ms > 0) await sleep(integration.wa_initial_delay_ms)

        const msgs = integration.wa_messages || []
        const vars = { nome: buyerName, email: buyerEmail, produto: productName, valor: saleAmount.toFixed(2) }

        for (const msg of msgs) {
          const content = (msg.content || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || payload[k] || '')
          await sendBaileysMessage(session.socket, jid, { ...msg, content })
          await sleep(integration.wa_interval_ms || 2000)
        }

        await sb.from('perfectpay_events').update({ wa_sent: true }).eq('id', event.id)
      } catch (e) {
        app.log.error('PerfectPay WA send error: ' + e.message)
        await sb.from('perfectpay_events').update({ error_message: e.message }).eq('id', event.id)
      }
    })()
  }

  return reply.status(200).send({ ok: true, event_id: event.id })
})

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000')

await app.listen({ port: PORT, host: '0.0.0.0' })
app.log.info(`Server running on port ${PORT}`)

// Reconectar sessões Baileys salvas
setTimeout(() => bootBaileySessions().catch(e => app.log.error('Boot Baileys error: ' + e.message)), 3000)

// Schedulers
setInterval(runEmailScheduler, 30_000)
setInterval(runGroupCampaignScheduler, 30_000)

// Rodar uma vez 5s após boot (pegar itens atrasados)
setTimeout(runEmailScheduler, 5_000)
setTimeout(runGroupCampaignScheduler, 7_000)
