// Arcade account: one email + password sign-in shared by every game.
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
      ? `<span class="arc-who" title="Signed in to Arcade as ${esc(u.email)}"><i aria-hidden="true">${esc((u.email || '?')[0].toUpperCase())}</i><span>${esc(u.email)}</span></span><button type="button" class="arc-link" data-arc="out">Sign out</button>`
      : '<button type="button" class="arc-btn" data-arc="in">Sign in</button>';
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-arc]');
    if (!b) return;
    if (b.dataset.arc === 'in') openDialog();
    else if (confirm('Sign out of Arcade on this device?')) await c.auth.signOut({ scope: 'local' });
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
        <h2 data-t="title">Sign in to Arcade</h2>
        <p class="arc-muted">One account for every game. Your settings and connections follow you to every device.</p>
        <label>Email<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
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
      t('title').textContent = s ? 'Create an Arcade account' : 'Sign in to Arcade';
      t('go').textContent = s ? 'Create account' : 'Sign in';
      t('mode').textContent = s ? 'Have an account? Sign in' : 'New here? Create an account';
      f.password.autocomplete = s ? 'new-password' : 'current-password';
      t('msg').textContent = '';
    };
    t('mode').onclick = () => setMode(!signup);
    t('close').onclick = () => dlg.close();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.email.value.trim();
      const password = f.password.value;
      t('go').disabled = true;
      t('msg').textContent = signup ? 'Creating your account…' : 'Signing in…';
      const res = signup
        ? await c.auth.signUp({ email, password, options: { emailRedirectTo: window.ARCADE.home } })
        : await c.auth.signInWithPassword({ email, password });
      t('go').disabled = false;
      if (res.error) { t('msg').textContent = res.error.message; return; }
      if (signup && !res.data.session) {
        t('msg').textContent = `Check ${email} for a confirmation link, then sign in here.`;
        setTimeout(() => setMode(false), 50);
        return;
      }
      dlg.close();
      f.reset();
    });
    dlg.setMode = setMode;
  }
  dlg.setMode(false);
  dlg.showModal();
}
