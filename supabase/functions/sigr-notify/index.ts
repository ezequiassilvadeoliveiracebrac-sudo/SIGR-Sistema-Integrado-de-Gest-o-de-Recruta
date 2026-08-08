import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sigr-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'https://ezequiassilvadeoliveiracebrac-sudo.github.io/'
const cronSecret = Deno.env.get('SIGR_CRON_SECRET') || ''

if (!supabaseUrl || !serviceRole) console.error('SIGR Push: credenciais internas do Supabase indisponíveis.')

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type PushSubscriptionJSON = {
  endpoint: string
  expirationTime?: number | null
  keys?: { p256dh?: string; auth?: string }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function saoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

function addDays(iso: string, amount: number) {
  const d = new Date(`${iso}T12:00:00-03:00`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}

function humanDate(iso: string) {
  return iso.split('-').reverse().join('/')
}

function timeReached(now: string, threshold: string | null | undefined) {
  return now >= String(threshold || '00:00').slice(0, 5)
}

async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw new Error('AUTH_REQUIRED')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error('AUTH_REQUIRED')
  return data.user
}

async function broadcastPush(payload: Record<string, unknown>) {
  if (!vapidPublic || !vapidPrivate) throw new Error('VAPID_NOT_CONFIGURED')
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const { data: subs, error } = await admin.from('sigr_push_subscriptions').select('id,subscription')
  if (error) throw error
  let delivered = 0
  for (const row of subs || []) {
    try {
      await webpush.sendNotification(row.subscription as any, JSON.stringify(payload), { TTL: 86400 })
      delivered++
    } catch (err) {
      const statusCode = Number((err as { statusCode?: number })?.statusCode || 0)
      if (statusCode === 404 || statusCode === 410) await admin.from('sigr_push_subscriptions').delete().eq('id', row.id)
      else console.warn('SIGR Push: falha em assinatura', statusCode || String(err))
    }
  }
  return delivered
}

async function publishNotification(input: { category: string; title: string; body: string; dedupeKey: string; tag?: string }) {
  const { data: existing } = await admin.from('sigr_notifications').select('id').eq('dedupe_key', input.dedupeKey).maybeSingle()
  if (existing?.id) return { created: false, delivered: 0 }

  const { error } = await admin.from('sigr_notifications').insert({
    category: input.category,
    title: input.title,
    body: input.body,
    dedupe_key: input.dedupeKey,
  })
  if (error) {
    if (error.code === '23505') return { created: false, delivered: 0 }
    throw error
  }

  const delivered = await broadcastPush({
    title: input.title,
    body: input.body,
    tag: input.tag || input.dedupeKey,
    renotify: false,
    url: './',
  })
  return { created: true, delivered }
}

async function getNotificationSettings() {
  const { data } = await admin.from('sigr_notification_settings').select('*').eq('id', true).maybeSingle()
  return data || {
    consultation_day_before_after: '18:00', consultation_today_after: '06:00', daily_leader_after: '20:00',
    consultation_enabled: true, occurrence_milestone_enabled: true, daily_leader_enabled: true,
  }
}

async function processOccurrenceMilestone(day: string, enabled = true) {
  if (!enabled) return null
  const { data, error } = await admin.from('occurrences').select('id,recruitId,points,type,date').eq('date', day).order('id', { ascending: true })
  if (error) throw error
  const rows = data || []
  const maxMilestone = Math.floor(rows.length / 10) * 10
  if (maxMilestone < 10) return null
  const results = []
  for (let milestone = 10; milestone <= maxMilestone; milestone += 10) {
    const counted = rows.slice(0, milestone)
    const negatives = counted.filter(r => Number(r.points) < 0 || String(r.type).toLowerCase().includes('neg')).length
    const positives = counted.filter(r => Number(r.points) > 0 || String(r.type).toLowerCase().includes('pos')).length
    results.push(await publishNotification({
      category: 'BALANÇO OPERACIONAL',
      title: 'SIGR | BALANÇO OPERACIONAL',
      body: `${milestone} ocorrências registradas hoje. ${negatives} negativas | ${positives} positivas.`,
      dedupeKey: `occurrence-milestone:${day}:${milestone}`,
      tag: `sigr-occ-${day}-${milestone}`,
    }))
  }
  return results
}

async function processConsultations(today: string, nowTime: string, settings: Record<string, unknown>) {
  if (!settings.consultation_enabled) return []
  const tomorrow = addDays(today, 1)
  const { data, error } = await admin.from('events').select('id,date,time,type,recruitId,title,notes').in('date', [today, tomorrow])
  if (error) throw error
  const events = (data || []).filter(ev => {
    const text = `${ev.type || ''} ${ev.title || ''} ${ev.notes || ''}`.toLowerCase()
    return text.includes('consulta') || text.includes('médic') || text.includes('medic') || text.includes('odont')
  })
  const results = []
  for (const ev of events) {
    const isToday = ev.date === today
    const threshold = isToday ? String(settings.consultation_today_after || '06:00') : String(settings.consultation_day_before_after || '18:00')
    if (!timeReached(nowTime, threshold)) continue
    const phase = isToday ? 'today' : 'tomorrow'
    const recruit = ev.recruitId ? `Recruta ${String(ev.recruitId).padStart(3,'0')}` : 'Turma'
    const when = isToday ? 'Hoje' : 'Amanhã'
    const at = ev.time ? `, às ${String(ev.time).slice(0,5).replace(':','h')}` : ''
    results.push(await publishNotification({
      category: 'CONSULTA PROGRAMADA',
      title: 'SIGR | CONSULTA PROGRAMADA',
      body: `${recruit} | ${when}${at} | ${ev.title || 'Consulta'}.`,
      dedupeKey: `consultation:${ev.id}:${phase}:${ev.date}`,
      tag: `sigr-consult-${ev.id}-${phase}`,
    }))
  }
  return results
}

async function processDailyLeader(day: string, nowTime: string, settings: Record<string, unknown>) {
  if (!settings.daily_leader_enabled || !timeReached(nowTime, String(settings.daily_leader_after || '20:00'))) return null
  const { data, error } = await admin.from('occurrences').select('recruitId,points,type').eq('date', day)
  if (error) throw error
  const grouped = new Map<string, { total: number; neg: number; pos: number }>()
  for (const row of data || []) {
    const id = String(row.recruitId).padStart(3,'0')
    const item = grouped.get(id) || { total: 0, neg: 0, pos: 0 }
    item.total++
    if (Number(row.points) < 0 || String(row.type).toLowerCase().includes('neg')) item.neg++
    if (Number(row.points) > 0 || String(row.type).toLowerCase().includes('pos')) item.pos++
    grouped.set(id, item)
  }
  const leader = [...grouped.entries()].sort((a,b) => b[1].total - a[1].total || b[1].neg - a[1].neg || a[0].localeCompare(b[0]))[0]
  if (!leader) return null
  return publishNotification({
    category: 'ALERTA DE ACOMPANHAMENTO',
    title: 'SIGR | ALERTA DE ACOMPANHAMENTO',
    body: `O Recruta ${leader[0]} apresentou o maior número de ocorrências registradas em ${humanDate(day)}: ${leader[1].total}, sendo ${leader[1].neg} negativas e ${leader[1].pos} positivas.`,
    dedupeKey: `daily-leader:${day}`,
    tag: `sigr-leader-${day}`,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '')

    if (action === 'public-key') {
      if (!vapidPublic) return json({ error: 'Web Push ainda não foi configurado.' }, 503)
      return json({ publicKey: vapidPublic })
    }

    if (action === 'scheduled') {
      const supplied = req.headers.get('x-sigr-cron-secret') || ''
      if (!cronSecret || supplied !== cronSecret) return json({ error: 'Acesso negado.' }, 401)
      const now = saoPauloParts()
      const settings = await getNotificationSettings()
      const [consultations, milestone, leader] = await Promise.all([
        processConsultations(now.day, now.time, settings),
        processOccurrenceMilestone(now.day, Boolean(settings.occurrence_milestone_enabled)),
        processDailyLeader(now.day, now.time, settings),
      ])
      return json({ ok: true, day: now.day, consultations, milestone, leader })
    }

    const user = await requireUser(req)

    if (action === 'subscribe') {
      const subscription = body.subscription as PushSubscriptionJSON | undefined
      if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return json({ error: 'Assinatura inválida.' }, 400)
      const { error } = await admin.from('sigr_push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription,
        user_agent: req.headers.get('user-agent') || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'occurrence-milestone') {
      const now = saoPauloParts()
      const settings = await getNotificationSettings()
      const result = await processOccurrenceMilestone(now.day, Boolean(settings.occurrence_milestone_enabled))
      return json({ ok: true, result })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (error) {
    if (String((error as Error)?.message) === 'AUTH_REQUIRED') return json({ error: 'Sessão inválida ou expirada.' }, 401)
    console.error('SIGR Push:', error)
    return json({ error: 'Falha interna no serviço de notificações.' }, 500)
  }
})
