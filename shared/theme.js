// Arcade theme: follows the device (light/dark) unless the visitor picks one.
// Load as a plain <script> in <head> so the page never flashes the wrong theme.
(function () {
  var KEY = 'arcade-theme';
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  apply(saved());
  function current() {
    var t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  window.ArcadeTheme = {
    current: current,
    toggle: function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still switch for this page */ }
      apply(next);
      document.dispatchEvent(new CustomEvent('arcade-theme', { detail: next }));
      return next;
    },
    // Fills el with a sun/moon button that flips the theme.
    mount: function (el) {
      if (!el) return;
      el.innerHTML = '<button type="button" class="ar-icon-btn" aria-label="Switch light or dark theme" title="Light / dark">' +
        '<svg class="ar-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.8v2.6M12 19.6v2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M1.8 12h2.6M19.6 12h2.6M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8"/></svg>' +
        '<svg class="ar-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg></button>';
      el.firstChild.addEventListener('click', function () { window.ArcadeTheme.toggle(); });
    },
  };
})();
