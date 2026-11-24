// Carries the Lichess connection across devices through the Arcade account.
// Table: public.lichess_links, one owner-only row per account.
import { client, user } from '../shared/account.js?v=3';

export { user };

// { lichess_token, lichess_username } or null when nothing is saved. Throws on
// network/database errors so callers can tell "none" from "couldn't check".
export async function pull() {
  const { data, error } = await client().from('lichess_links').select('lichess_token, lichess_username').maybeSingle();
  if (error) throw error;
  return data;
}

export async function push(token, username) {
  const u = await user();
  if (!u) return;
  const { error } = await client().from('lichess_links').upsert({
    user_id: u.id,
    lichess_token: token,
    lichess_username: /^[A-Za-z0-9_-]{2,30}$/.test(username || '') ? username : null,
  });
  if (error) throw error;
}

// Removes the saved connection. With a token, only if it is still that one,
// so a device holding a dead key can't wipe a fresh connection made elsewhere.
export async function drop(token) {
  const u = await user();
  if (!u) return;
  let q = client().from('lichess_links').delete().eq('user_id', u.id);
  if (token) q = q.eq('lichess_token', token);
  const { error } = await q;
  if (error) throw error;
}
