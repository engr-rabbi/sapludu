"""PWA checks in headless Chromium: manifest + installability (CDP), service worker, offline reload, install bar."""
import os
import sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_google import install
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'])
    install(ctx, 'dave@example.com', 'Dave Hasan')
    pg = ctx.new_page()
    pg.goto('http://127.0.0.1:3000/')
    pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
    time.sleep(2)
    pg.reload(); time.sleep(1.5)
    print('SW controller after reload:', pg.evaluate("!!navigator.serviceWorker.controller"))
    print('caches:', pg.evaluate("caches.keys()"))
    cdp = ctx.new_cdp_session(pg)
    cdp.send('Page.enable')
    err = cdp.send('Page.getInstallabilityErrors')
    print('installability errors:', err.get('installabilityErrors'))
    man = pg.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json())")
    print('manifest:', man['name'], man['display'], [i['sizes']+':'+i.get('purpose','') for i in man['icons']])
    print('install bar visible:', pg.locator('[data-testid=install-bar]').is_visible())
    pg.locator('[data-testid=install-bar] button').click(); time.sleep(0.6)
    pg.screenshot(path='/tmp/sapludu-shots/30-install-help.png')
    print('help dialog text:', pg.locator('[role=dialog]').inner_text()[:160].replace('\n',' | '))
    pg.keyboard.press('Escape')
    # offline
    ctx.set_offline(True)
    pg.reload(); time.sleep(1.5)
    print('offline reload title:', pg.title())
    print('offline banner:', pg.locator('text=You are offline').count() > 0)
    pg.screenshot(path='/tmp/sapludu-shots/31-offline.png')
    pg.get_by_role('button', name='Sign In').first.click(); time.sleep(0.8)
    pg.get_by_role('link', name='x') if False else None
    # online-only features say so rather than faking it
    pg.goto('http://127.0.0.1:3000/?view=online') if False else None
    # sign-in attempt offline → clear message
    try:
        pg.locator('#fake-google-btn').click(timeout=3000)
        time.sleep(1.5)
        print('offline sign-in message:', pg.locator('[role=alert]').first.inner_text())
    except Exception as e:
        print('google button not available offline (expected):', pg.locator('[role=alert]').count(), 'alert(s)')
    ctx.set_offline(False)
    # app opens as standalone → no install bar
    ctx2 = b.new_context(**p.devices['Pixel 7'])
    install(ctx2, 'eve@example.com', 'Eve')
    ctx2.add_init_script("const m = window.matchMedia.bind(window); window.matchMedia = q => q.includes('standalone') ? {matches:true, media:q, addEventListener(){}, removeEventListener(){}} : m(q);")
    p2 = ctx2.new_page(); p2.goto('http://127.0.0.1:3000/'); time.sleep(1.5)
    print('install bar hidden when already installed (standalone):', p2.locator('[data-testid=install-bar]').count() == 0)
    b.close()
