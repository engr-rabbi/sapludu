"""Shared helpers for the browser tests: a fake Google Identity Services script (the real one cannot run without
Google credentials) that mints tokens from the local test stack."""
FAKE_GSI = r"""
window.google = { accounts: { id: {
  initialize(cfg) { window.__gsiCb = cfg.callback; },
  renderButton(el) {
    el.innerHTML = '<button id="fake-google-btn" style="padding:10px 18px;border-radius:999px;background:#1a73e8;color:#fff;font-weight:700">Continue with Google</button>';
    el.firstChild.onclick = async () => {
      const who = window.__fakeUser || {email:'alice@example.com', name:'Alice Rahman'};
      const r = await fetch('http://127.0.0.1:8787/mint?email=' + encodeURIComponent(who.email) + '&name=' + encodeURIComponent(who.name));
      window.__gsiCb({ credential: await r.text() });
    };
  },
  disableAutoSelect() {}, cancel() {}
}}};
"""
def install(context, email, name):
    context.route("**/accounts.google.com/gsi/client", lambda route: route.fulfill(status=200, content_type="text/javascript", body=FAKE_GSI))
    context.add_init_script(f"window.__fakeUser = {{email: {email!r}, name: {name!r}}}; try {{ localStorage.setItem('sapludu-ui', JSON.stringify({{state:{{language:'en',sound:false,animation:'reduced',vibration:false,theme:'light',boardTheme:'classic'}},version:0}})) }} catch(e) {{}}")
