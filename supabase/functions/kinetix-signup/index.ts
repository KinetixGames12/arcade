// kinetix-signup: creates a Kinetix account from a username + password.
// No email is involved: the account's sign-in address is a private,
// never-mailed placeholder (<username>@users.kinetix.invalid), confirmed on
// creation. Limits: 5 sign-ups per IP per hour, usernames 3–20 of [a-z0-9_].
import { createClient } from 'npm:@supabase/supabase-js@2.110.1';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ALLOWED = [/^https:\/\/kinetixgames12\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const DOMAIN = 'users.kinetix.invalid';
const RESERVED = new Set(['admin', 'kinetix', 'support', 'moderator', 'system', 'root', 'null', 'undefined']);

function cors(origin: string | null) {
  const ok = origin && ALLOWED.some((r) => r.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'https://kinetixgames12.github.io',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'));
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { return reply(400, { error: 'Bad request' }); }
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return reply(400, { error: 'Usernames are 3–20 letters, numbers or underscores.' });
  if (RESERVED.has(username)) return reply(400, { error: 'That username is taken.' });
  if (password.length < 8 || password.length > 72) return reply(400, { error: 'Passwords need at least 8 characters.' });

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const ipHash = await sha(`kinetix:${ip}`);
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await sb.from('kx_signups').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
  if ((count ?? 0) >= 5) return reply(429, { error: 'Too many new accounts from this network. Try again in an hour.' });

  const { error } = await sb.auth.admin.createUser({
    email: `${username}@${DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return reply(taken ? 409 : 400, { error: taken ? 'That username is taken.' : error.message });
  }
  await sb.from('kx_signups').insert({ ip_hash: ipHash });
  await sb.from('kx_signups').delete().lt('created_at', new Date(Date.now() - 86400e3).toISOString());
  return reply(200, { ok: true, username });
});
