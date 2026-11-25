// Kinetix account: one username + password sign-in shared by every game.
// New accounts are made by the kinetix-signup edge function (no email needed);
// older email accounts still sign in with their email address.
// Games call client() for their own tables and mountAccount() for the
// header button. Needs supabase-js (UMD) and shared/config.js loaded first.

let sb = null;
const listeners = new Set();

export function client(opts = {}) {
  if (sb) return sb;
  if (!window.supabase?.createClient || !window.ARCADE) return null;
  sb = window.supabase.createClient(window.ARCADE.url, window.ARCADE.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'arcade-auth',
      // Pages that get their own ?code= redirects (Chess ← Lichess) turn this off.
      detectSessionInUrl: opts.detectSessionInUrl ?? true,
    },
  });
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') listeners.forEach((fn) => fn(event));
  });
  return sb;
}

export async function user() {
  const c = client();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data?.session?.user || null;
}

export function onAuthChange(fn) { listeners.add(fn); }

const USER_DOMAIN = 'users.kinetix.invalid';
// What to show for a signed-in person: their username, or their email for older accounts.
export function displayName(u) {
  if (!u) return '';
  return u.user_metadata?.username || (u.email?.endsWith(`@${USER_DOMAIN}`) ? u.email.split('@')[0] : u.email) || 'Player';
}

// Opens the Kinetix sign-in dialog (for pages that need an account).
export function openSignIn() { if (client()) openDialog(); }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Renders "Sign in" / "you@x · Sign out" into el, with a sign-in dialog.
export function mountAccount(el, opts = {}) {
  const c = client(opts);
  if (!el) return;
  if (!c) { el.innerHTML = ''; return; }
  const render = async () => {
    const u = await user();
    el.className = 'arc-acct';
    el.innerHTML = u
      ? `<span class="arc-who" title="Signed in to Kinetix as ${esc(displayName(u))}"><i aria-hidden="true">${esc((displayName(u) || '?')[0].toUpperCase())}</i><span>${esc(displayName(u))}</span></span><button type="button" class="arc-link" data-arc="out">Sign out</button>`
      : '<button type="button" class="arc-btn" data-arc="in">Sign in</button>';
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-arc]');
    if (!b) return;
    if (b.dataset.arc === 'in') openDialog();
    else if (confirm('Sign out of Kinetix on this device?')) await c.auth.signOut({ scope: 'local' });
  });
  onAuthChange(render);
  render();
}

function openDialog() {
  const c = client();
  let dlg = document.getElementById('arcDialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'arcDialog';
    dlg.className = 'arc-dialog';
    dlg.innerHTML = `
      <form method="dialog" class="arc-form">
        <h2 data-t="title">Sign in to Kinetix</h2>
        <p class="arc-muted" data-t="sub">One account for every game. No email needed.</p>
        <label><span data-t="idlabel">Username or email</span><input name="login" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="80"></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
        <label data-t="again" hidden>Password again<input name="password2" type="password" autocomplete="new-password" minlength="8"></label>
        <p class="arc-msg" data-t="msg" role="status"></p>
        <div class="arc-row">
          <button type="submit" class="arc-btn" data-t="go">Sign in</button>
          <button type="button" class="arc-link" data-t="mode">New here? Create an account</button>
        </div>
        <button type="button" class="arc-x" aria-label="Close" data-t="close">✕</button>
      </form>`;
    document.body.appendChild(dlg);
    const f = dlg.querySelector('form');
    const t = (k) => dlg.querySelector(`[data-t="${k}"]`);
    let signup = false;
    const setMode = (s) => {
      signup = s;
      t('title').textContent = s ? 'Create a Kinetix account' : 'Sign in to Kinetix';
      t('go').textContent = s ? 'Create account' : 'Sign in';
      t('mode').textContent = s ? 'Have an account? Sign in' : 'New here? Create an account';
      t('idlabel').textContent = s ? 'Pick a username' : 'Username or email';
      t('sub').textContent = s ? 'Usernames are 3–20 letters, numbers or underscores. Nobody sees your password, and there is no email to confirm.' : 'One account for every game. No email needed.';
      t('again').hidden = !s;
      f.password2.required = s;
      f.password.autocomplete = s ? 'new-password' : 'current-password';
      t('msg').textContent = '';
    };
    t('mode').onclick = () => setMode(!signup);
    t('close').onclick = () => dlg.close();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = f.login.value.trim();
      const password = f.password.value;
      if (signup && password !== f.password2.value) { t('msg').textContent = 'The two passwords don’t match.'; return; }
      t('go').disabled = true;
      t('msg').textContent = signup ? 'Creating your account…' : 'Signing in…';
      try {
        if (signup) {
          const r = await fetch(`${window.ARCADE.url}/functions/v1/kinetix-signup`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.ARCADE.key },
            body: JSON.stringify({ username: login, password }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'Couldn’t create the account. Try again.');
        }
        const email = login.includes('@') ? login : `${login.toLowerCase()}@${USER_DOMAIN}`;
        const res = await c.auth.signInWithPassword({ email, password });
        if (res.error) throw new Error(/invalid/i.test(res.error.message) ? 'Wrong username or password.' : res.error.message);
        dlg.close();
        f.reset();
      } catch (err) {
        t('msg').textContent = err.message;
      } finally {
        t('go').disabled = false;
      }
    });
    dlg.setMode = setMode;
  }
  dlg.setMode(false);
  dlg.showModal();
}
