// SIGR | Edge Function de autenticação por usuário, perfis, auditoria, ranking, chat, push e chamadas.
// Atualização 2026-08-17: operator-delete, activity-weekly-list e activity-operator-list.
// Deploy com verify_jwt = false: a ação "login" ocorre antes de existir JWT.
// As demais ações validam manualmente o JWT do Supabase e o token individual.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
function injectedKey(pluralName: string, legacyName: string) {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;
  const raw = Deno.env.get(pluralName) || '';
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.default || Object.values(parsed)[0] || '');
  } catch (_) { return raw; }
}
const SUPABASE_ANON_KEY = injectedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = injectedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const TEAM_USERNAME = normalizeUsername(Deno.env.get('SIGR_TEAM_USERNAME') || 'equipe.sigr');
const TEAM_EMAIL = Deno.env.get('SIGR_TEAM_EMAIL') || '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:administrador@sigr.local';

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const encoder = new TextEncoder();
const publicOperatorColumns = 'id,rank,war_name,duty_function,avatar_color,active,created_at,updated_at';

function normalizeUsername(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '.');
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function derivePinHash(pin: string, saltBase64: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(saltBase64), iterations: 160000 },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${crypto.randomUUID()}.${bytesToHex(bytes)}`;
}

function conversationKey(type: string, a: string, b?: string | null) {
  if (type === 'group') return 'group';
  return `private:${[String(a), String(b || '')].sort().join(':')}`;
}

async function requireAuth(req: Request) {
  const header = req.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sessão principal ausente.');
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error('Sessão principal inválida.');
  return data.user;
}

async function requireOperator(operatorToken: string, authUserId: string) {
  if (!operatorToken) throw new Error('Identificação operacional necessária.');
  const tokenHash = await sha256(operatorToken);
  const { data, error } = await service
    .from('sigr_operator_sessions')
    .select(`token_hash,operator_id,auth_user_id,expires_at,operator:sigr_operators(${publicOperatorColumns})`)
    .eq('token_hash', tokenHash)
    .eq('auth_user_id', authUserId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data || !data.operator || !(data.operator as Record<string, unknown>).active) throw new Error('Identificação expirada. Informe seu PIN novamente.');
  await service.from('sigr_operator_sessions').update({ last_seen: new Date().toISOString() }).eq('token_hash', tokenHash);
  return { operator: data.operator as Record<string, any>, tokenHash };
}

async function createOperatorSession(operatorId: string, authUserId: string, userAgent = '') {
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const { error } = await service.from('sigr_operator_sessions').insert({
    token_hash: tokenHash,
    operator_id: operatorId,
    auth_user_id: authUserId,
    expires_at: expiresAt,
    user_agent: String(userAgent || '').slice(0, 500),
  });
  if (error) throw error;
  return { rawToken, expiresAt };
}

async function listOperators() {
  const { data, error } = await service.from('sigr_operators').select(publicOperatorColumns).eq('active', true).order('rank').order('war_name');
  if (error) throw error;
  const operators = data || [];
  const { data: sessions } = await service.from('sigr_operator_sessions').select('operator_id,last_seen').gt('expires_at', new Date().toISOString());
  const lastSeen = new Map<string, string>();
  for (const row of sessions || []) {
    const current = lastSeen.get(row.operator_id);
    if (!current || row.last_seen > current) lastSeen.set(row.operator_id, row.last_seen);
  }
  return operators.map(operator => ({ ...operator, last_seen: lastSeen.get(operator.id) || null }));
}

async function unreadCounts(operatorId: string) {
  const { data: reads } = await service.from('sigr_message_reads').select('conversation_key,last_read_at').eq('reader_operator_id', operatorId);
  const readMap = new Map((reads || []).map(row => [row.conversation_key, row.last_read_at]));
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data: incoming, error } = await service
    .from('sigr_chat_messages')
    .select('channel_type,sender_operator_id,recipient_operator_id,created_at')
    .neq('sender_operator_id', operatorId)
    .gte('created_at', since)
    .or(`channel_type.eq.group,recipient_operator_id.eq.${operatorId}`);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const message of incoming || []) {
    const key = message.channel_type === 'group' ? 'group' : conversationKey('private', operatorId, message.sender_operator_id);
    if (!readMap.get(key) || message.created_at > (readMap.get(key) as string)) counts[message.channel_type === 'group' ? 'group' : `private:${message.sender_operator_id}`] = (counts[message.channel_type === 'group' ? 'group' : `private:${message.sender_operator_id}`] || 0) + 1;
  }
  return counts;
}

async function sendPush(operatorIds: string[], payload: Record<string, unknown>) {
  if (!operatorIds.length || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const { data: rows } = await service.from('sigr_comm_push_subscriptions').select('endpoint,p256dh,auth').in('operator_id', operatorIds);
  const stale: string[] = [];
  await Promise.allSettled((rows || []).map(async row => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { TTL: payload.kind === 'call' ? 120 : 86400, urgency: payload.kind === 'call' ? 'high' : 'normal' });
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) stale.push(row.endpoint);
    }
  }));
  if (stale.length) await service.from('sigr_comm_push_subscriptions').delete().in('endpoint', stale);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'login') {
      if (!TEAM_EMAIL) return json({ error: 'O e-mail operacional ainda não foi configurado na Edge Function.' }, 503);
      if (normalizeUsername(body.username) !== TEAM_USERNAME || !body.password) return json({ error: 'Usuário ou senha inválidos.' }, 401);
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await authClient.auth.signInWithPassword({ email: TEAM_EMAIL, password: String(body.password) });
      if (error || !data.session) return json({ error: 'Usuário ou senha inválidos.' }, 401);
      return json({ session: data.session });
    }

    if (action === 'push-public-key') {
      if (!VAPID_PUBLIC_KEY) return json({ error: 'Web Push ainda não foi configurado.' }, 503);
      return json({ publicKey: VAPID_PUBLIC_KEY });
    }

    const user = await requireAuth(req);

    if (action === 'operators-list') return json({ operators: await listOperators() });

    if (action === 'operator-register') {
      const profile = body.profile || {};
      const rank = String(profile.rank || '').trim().toUpperCase().slice(0, 20);
      const warName = String(profile.warName || '').trim().slice(0, 50);
      const dutyFunction = String(profile.dutyFunction || 'Operador').trim().slice(0, 60);
      const avatarColor = /^#[0-9a-f]{6}$/i.test(String(profile.avatarColor || '')) ? String(profile.avatarColor) : '#2563eb';
      const pin = String(body.pin || '');
      if (!rank || !warName || !/^\d{6}$/.test(pin)) throw new Error('Informe graduação, nome de guerra e um PIN de 6 números.');
      const { count } = await service.from('sigr_operators').select('id', { count: 'exact', head: true }).eq('active', true);
      if ((count || 0) >= 15) throw new Error('O limite de 15 integrantes já foi atingido.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const pinSalt = bytesToBase64(salt);
      const pinHash = await derivePinHash(pin, pinSalt);
      const { data: operator, error } = await service.from('sigr_operators').insert({
        rank, war_name: warName, duty_function: dutyFunction, avatar_color: avatarColor,
        pin_salt: pinSalt, pin_hash: pinHash, created_by: user.id,
      }).select(publicOperatorColumns).single();
      if (error) {
        if (error.code === '23505') throw new Error('Já existe uma identificação com essa graduação e nome.');
        throw error;
      }
      const session = await createOperatorSession(operator.id, user.id, req.headers.get('user-agent') || '');
      return json({ operator, operatorToken: session.rawToken, expiresAt: session.expiresAt });
    }

    if (action === 'operator-login') {
      const operatorId = String(body.operatorId || '');
      const pin = String(body.pin || '');
      if (!operatorId || !/^\d{6}$/.test(pin)) throw new Error('PIN inválido.');
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: failures } = await service.from('sigr_operator_attempts').select('id', { count: 'exact', head: true }).eq('operator_id', operatorId).eq('success', false).gte('attempted_at', tenMinutesAgo);
      if ((failures || 0) >= 5) throw new Error('Muitas tentativas. Aguarde 10 minutos e tente novamente.');
      const { data: operator, error } = await service.from('sigr_operators').select(`${publicOperatorColumns},pin_salt,pin_hash`).eq('id', operatorId).eq('active', true).maybeSingle();
      if (error || !operator) throw new Error('Identificação não encontrada.');
      const candidate = await derivePinHash(pin, operator.pin_salt);
      const success = safeEqual(candidate, operator.pin_hash);
      await service.from('sigr_operator_attempts').insert({ operator_id: operatorId, auth_user_id: user.id, success });
      if (!success) throw new Error('PIN inválido.');
      const { pin_salt: _salt, pin_hash: _hash, ...publicOperator } = operator;
      const session = await createOperatorSession(operator.id, user.id, req.headers.get('user-agent') || '');
      return json({ operator: publicOperator, operatorToken: session.rawToken, expiresAt: session.expiresAt });
    }

    if (action === 'operator-session') {
      const active = await requireOperator(String(body.operatorToken || ''), user.id);
      return json({ operator: active.operator });
    }

    if (action === 'operator-change-pin') {
      const activePin = await requireOperator(String(body.operatorToken || ''), user.id);
      const currentPin = String(body.currentPin || '');
      const newPin = String(body.newPin || '');
      if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) throw new Error('O PIN precisa ter exatamente 6 números.');
      if (currentPin === newPin) throw new Error('Escolha um PIN diferente do atual.');
      const { data: operatorRow, error: operatorError } = await service
        .from('sigr_operators').select('id,pin_salt,pin_hash').eq('id', activePin.operator.id).eq('active', true).maybeSingle();
      if (operatorError || !operatorRow) throw new Error('Identificação não encontrada.');
      const candidate = await derivePinHash(currentPin, operatorRow.pin_salt);
      if (!safeEqual(candidate, operatorRow.pin_hash)) throw new Error('PIN atual inválido.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const pinSalt = bytesToBase64(salt);
      const pinHash = await derivePinHash(newPin, pinSalt);
      const { error: updateError } = await service.from('sigr_operators').update({
        pin_salt: pinSalt, pin_hash: pinHash, updated_at: new Date().toISOString()
      }).eq('id', operatorRow.id);
      if (updateError) throw updateError;
      // Invalida outras sessões do mesmo integrante, mantendo a atual.
      await service.from('sigr_operator_sessions').delete().eq('operator_id', operatorRow.id).neq('token_hash', activePin.tokenHash);
      return json({ ok: true });
    }

    if (action === 'operator-logout') {
      const tokenHash = await sha256(String(body.operatorToken || ''));
      await service.from('sigr_operator_sessions').delete().eq('token_hash', tokenHash).eq('auth_user_id', user.id);
      return json({ ok: true });
    }

    if (action === 'operator-delete') {
      const targetOperatorId = String(body.operatorId || '');
      if (!targetOperatorId) throw new Error('Perfil inválido.');
      const { data: accountProfile, error: roleError } = await service.from('sigr_user_profiles').select('role').eq('user_id', user.id).maybeSingle();
      if (roleError) throw roleError;
      if (String(accountProfile?.role || '').toLowerCase() !== 'admin') throw new Error('Somente o administrador pode remover perfis.');
      const { data: target, error: targetError } = await service.from('sigr_operators').select(publicOperatorColumns).eq('id', targetOperatorId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) throw new Error('Perfil não encontrado.');
      const now = new Date().toISOString();
      const { error: deactivateError } = await service.from('sigr_operators').update({ active: false, updated_at: now }).eq('id', targetOperatorId);
      if (deactivateError) throw deactivateError;
      await Promise.allSettled([
        service.from('sigr_operator_sessions').delete().eq('operator_id', targetOperatorId),
        service.from('sigr_comm_push_subscriptions').delete().eq('operator_id', targetOperatorId),
      ]);
      return json({ ok: true, operator: { ...target, active: false, updated_at: now } });
    }

    const active = await requireOperator(String(body.operatorToken || ''), user.id);
    const operatorId = String(active.operator.id);

    if (action === 'activity-log') {
      const actionName = String(body.activity || '').trim().slice(0, 80);
      if (!actionName) throw new Error('Atividade inválida.');
      const { error } = await service.from('sigr_operator_activity').insert({
        operator_id: operatorId,
        action: actionName,
        entity_type: body.entityType ? String(body.entityType).slice(0, 60) : null,
        entity_id: body.entityId ? String(body.entityId).slice(0, 120) : null,
        details: body.details && typeof body.details === 'object' ? body.details : {},
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'activity-list') {
      const { data: rows, error } = await service.from('sigr_operator_activity').select('*').order('created_at', { ascending: false }).limit(150);
      if (error) throw error;
      const operatorIds = [...new Set((rows || []).map(row => row.operator_id))];
      const { data: operators } = operatorIds.length ? await service.from('sigr_operators').select(publicOperatorColumns).in('id', operatorIds) : { data: [] };
      const operatorMap = new Map((operators || []).map(item => [item.id, item]));
      return json({ activities: (rows || []).map(row => ({ ...row, operator: operatorMap.get(row.operator_id) || null })) });
    }

    if (action === 'activity-weekly-list') {
      const weekStart = String(body.weekStart || '');
      const weekEnd = String(body.weekEnd || '');
      const startDate = new Date(weekStart);
      const endDate = new Date(weekEnd);
      if (!weekStart || !weekEnd || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) throw new Error('Período semanal inválido.');
      const maxWindowMs = 9 * 24 * 60 * 60 * 1000;
      if (endDate.getTime() - startDate.getTime() > maxWindowMs) throw new Error('Período semanal excede o limite permitido.');
      const { data: rows, error } = await service.from('sigr_operator_activity').select('*').gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString()).order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      const operatorIds = [...new Set((rows || []).map(row => row.operator_id))];
      const { data: operators } = operatorIds.length ? await service.from('sigr_operators').select(publicOperatorColumns).in('id', operatorIds) : { data: [] };
      const operatorMap = new Map((operators || []).map(item => [item.id, item]));
      return json({ activities: (rows || []).map(row => ({ ...row, operator: operatorMap.get(row.operator_id) || null })) });
    }

    if (action === 'activity-operator-list') {
      const requestedOperatorId = String(body.operatorId || '');
      if (!requestedOperatorId) throw new Error('Integrante inválido.');
      const limit = Math.min(Math.max(Number(body.limit) || 100, 20), 250);
      const { data: rows, error } = await service.from('sigr_operator_activity').select('*').eq('operator_id', requestedOperatorId).order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      const { data: requestedOperator } = await service.from('sigr_operators').select(publicOperatorColumns).eq('id', requestedOperatorId).maybeSingle();
      return json({ activities: (rows || []).map(row => ({ ...row, operator: requestedOperator || null })) });
    }

    if (action === 'messages-list') {
      const type = body.conversationType === 'private' ? 'private' : 'group';
      const other = body.otherOperatorId ? String(body.otherOperatorId) : null;
      const limit = Math.min(Math.max(Number(body.limit) || 100, 20), 250);
      let query = service.from('sigr_chat_messages').select('*').eq('channel_type', type).order('created_at', { ascending: false }).limit(limit);
      if (type === 'private') {
        if (!other) throw new Error('Selecione um integrante.');
        query = query.or(`and(sender_operator_id.eq.${operatorId},recipient_operator_id.eq.${other}),and(sender_operator_id.eq.${other},recipient_operator_id.eq.${operatorId})`);
      }
      const { data: rows, error } = await query;
      if (error) throw error;
      const messages = (rows || []).reverse();
      const senderIds = [...new Set(messages.map(row => row.sender_operator_id))];
      const { data: senders } = senderIds.length ? await service.from('sigr_operators').select(publicOperatorColumns).in('id', senderIds) : { data: [] };
      const senderMap = new Map((senders || []).map(sender => [sender.id, sender]));
      return json({ messages: messages.map(message => ({ ...message, sender: senderMap.get(message.sender_operator_id) || null })), operators: await listOperators(), unread: await unreadCounts(operatorId) });
    }

    if (action === 'message-send') {
      const type = body.conversationType === 'private' ? 'private' : 'group';
      const text = String(body.body || '').trim();
      if (!text || text.length > 2000) throw new Error('A mensagem precisa ter entre 1 e 2000 caracteres.');
      const recipient = type === 'private' ? String(body.recipientOperatorId || '') : null;
      if (type === 'private' && (!recipient || recipient === operatorId)) throw new Error('Destinatário inválido.');
      if (recipient) {
        const { count } = await service.from('sigr_operators').select('id', { count: 'exact', head: true }).eq('id', recipient).eq('active', true);
        if (!count) throw new Error('Integrante não encontrado.');
      }
      const { data: message, error } = await service.from('sigr_chat_messages').insert({ channel_type: type, sender_operator_id: operatorId, recipient_operator_id: recipient, body: text }).select('*').single();
      if (error) throw error;
      const targets = type === 'private'
        ? [recipient as string]
        : (await listOperators()).filter(item => item.id !== operatorId).map(item => item.id);
      const senderName = [active.operator.rank, active.operator.war_name].filter(Boolean).join(' ');
      await sendPush(targets, {
        kind: 'chat',
        title: type === 'private' ? `Mensagem privada de ${senderName}` : `Mensagem de ${senderName}`,
        body: text.length > 130 ? `${text.slice(0, 127)}...` : text,
        tag: `sigr-chat-${message.id}`,
        url: `./?view=comunicacao${type === 'private' ? `&operator=${operatorId}` : ''}`,
        data: { kind: 'chat', id: message.id, conversationType: type, senderOperatorId: operatorId },
      });
      return json({ message });
    }

    if (action === 'message-delete') {
      const { data: message } = await service.from('sigr_chat_messages').select('sender_operator_id').eq('id', body.messageId).maybeSingle();
      if (!message || message.sender_operator_id !== operatorId) throw new Error('Você só pode excluir suas próprias mensagens.');
      const { error } = await service.from('sigr_chat_messages').update({ body: null, deleted_at: new Date().toISOString() }).eq('id', body.messageId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'messages-read') {
      const type = body.conversationType === 'private' ? 'private' : 'group';
      const key = conversationKey(type, operatorId, body.otherOperatorId ? String(body.otherOperatorId) : null);
      const { error } = await service.from('sigr_message_reads').upsert({ reader_operator_id: operatorId, conversation_key: key, last_read_at: new Date().toISOString() }, { onConflict: 'reader_operator_id,conversation_key' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'push-subscribe') {
      const subscription = body.subscription || {};
      const endpoint = String(subscription.endpoint || '');
      const p256dh = String(subscription.keys?.p256dh || '');
      const auth = String(subscription.keys?.auth || '');
      if (!endpoint || !p256dh || !auth) throw new Error('Inscrição de notificações inválida.');
      const { error } = await service.from('sigr_comm_push_subscriptions').upsert({ endpoint, operator_id: operatorId, auth_user_id: user.id, p256dh, auth, user_agent: String(req.headers.get('user-agent') || '').slice(0, 500), updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'call-start') {
      const recipient = String(body.recipientOperatorId || '');
      if (!recipient || recipient === operatorId) throw new Error('Destinatário inválido.');
      const { data: call, error } = await service.from('sigr_calls').insert({ caller_operator_id: operatorId, recipient_operator_id: recipient, status: 'ringing' }).select('*').single();
      if (error) throw error;
      const callerName = [active.operator.rank, active.operator.war_name].filter(Boolean).join(' ');
      await sendPush([recipient], { kind: 'call', title: 'SIGR | Chamada recebida', body: `${callerName} está ligando. Toque para atender.`, tag: `sigr-call-${call.id}`, url: `./?view=comunicacao&call=${call.id}`, data: { kind: 'call', id: call.id, callerOperatorId: operatorId } });
      return json({ call });
    }

    if (action === 'call-pending') {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: call, error } = await service.from('sigr_calls').select('*').eq('recipient_operator_id', operatorId).eq('status', 'ringing').gte('created_at', since).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!call) return json({ call: null });
      const { data: caller } = await service.from('sigr_operators').select(publicOperatorColumns).eq('id', call.caller_operator_id).maybeSingle();
      return json({ call: { ...call, caller } });
    }

    if (action === 'call-update') {
      const status = String(body.status || '');
      if (!['accepted','rejected','ended','missed'].includes(status)) throw new Error('Status de chamada inválido.');
      const { data: call } = await service.from('sigr_calls').select('*').eq('id', body.callId).maybeSingle();
      if (!call || ![call.caller_operator_id, call.recipient_operator_id].includes(operatorId)) throw new Error('Chamada não encontrada.');
      const patch: Record<string, unknown> = { status };
      if (status === 'accepted') patch.answered_at = new Date().toISOString();
      if (['rejected','ended','missed'].includes(status)) patch.ended_at = new Date().toISOString();
      const { error } = await service.from('sigr_calls').update(patch).eq('id', call.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'call-signal') {
      const callId = String(body.callId || '');
      const recipient = String(body.toOperatorId || '');
      const kind = String(body.kind || '');
      if (!['offer','answer','ice','hangup'].includes(kind)) throw new Error('Sinal de chamada inválido.');
      const { data: call } = await service.from('sigr_calls').select('*').eq('id', callId).maybeSingle();
      if (!call || ![call.caller_operator_id, call.recipient_operator_id].includes(operatorId) || ![call.caller_operator_id, call.recipient_operator_id].includes(recipient) || recipient === operatorId) throw new Error('Chamada não autorizada.');
      const { error } = await service.from('sigr_call_signals').insert({ call_id: callId, sender_operator_id: operatorId, recipient_operator_id: recipient, kind, payload: body.signal || {} });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'call-signals-list') {
      const callId = String(body.callId || '');
      const { data: call } = await service.from('sigr_calls').select('*').eq('id', callId).maybeSingle();
      if (!call || ![call.caller_operator_id, call.recipient_operator_id].includes(operatorId)) throw new Error('Chamada não autorizada.');
      const { data: signals, error } = await service.from('sigr_call_signals').select('*').eq('call_id', callId).order('id');
      if (error) throw error;
      return json({ signals: signals || [] });
    }

    return json({ error: 'Ação não reconhecida.' }, 400);
  } catch (error: any) {
    console.error('SIGR communications:', error);
    const message = error?.message || 'Falha interna no módulo de comunicação.';
    const status = /sessão|identificação|PIN|autorizad/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
