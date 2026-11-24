"""Profile edit, friends by code, live invitation toast → join, leaderboard, and admin authorisation, through the UI."""
import re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_google import install
from playwright.sync_api import sync_playwright
def menu(pg, name):
    pg.get_by_label('Account menu').click(); time.sleep(0.3)
    pg.get_by_role('menuitem', name=re.compile(name)).first.click(); time.sleep(0.7)

def sign_in(pg):
    pg.goto('http://127.0.0.1:3000/'); pg.get_by_role('button', name='Sign In').first.click()
    pg.locator('#fake-google-btn').click(); pg.wait_for_selector('text=Welcome back', timeout=10000)
with sync_playwright() as p:
    b = p.chromium.launch()
    def mk(email, name, **kw):
        c = b.new_context(**kw) if kw else b.new_context(viewport={'width':1200,'height':850}); install(c, email, name); pg = c.new_page()
        pg.on('pageerror', lambda e: print('PAGEERR', e)); return pg
    G = mk('gina@example.com', 'Gina Das'); H = mk('hasan@example.com', 'Hasan Ali'); ADM = mk('boss@example.com', 'The Boss')
    for pg in (G, H, ADM): sign_in(pg)

    # profile edit
    menu(G, 'Profile')
    G.locator('#displayName').fill('Gina The Great'); G.get_by_role('button', name='Save').first.click(); time.sleep(1)
    G.reload(); time.sleep(1.5)
    print('profile persisted after reload:', G.locator('text=Welcome back, Gina The Great').count() == 1)
    G.screenshot(path='/tmp/sapludu-shots/40-profile.png')

    # friends by code
    menu(G, 'Profile')
    gid = G.locator('button:has-text("Friend code") span.font-mono').inner_text()
    H.get_by_role('button', name=re.compile('Friends')).first.click(); time.sleep(0.6)
    H.get_by_placeholder(re.compile('Friend code')).fill(gid); H.get_by_role('button', name='Add Friend').last.click(); time.sleep(1)
    G.get_by_role('button', name=re.compile('Friends')).first.click(); time.sleep(0.8)
    G.get_by_role('tab', name=re.compile('Requests')).click(); time.sleep(0.4)
    G.get_by_role('button', name='Accept').first.click(); time.sleep(1)
    G.get_by_role('tab', name=re.compile('Friends \\(')).click(); time.sleep(0.4)
    print('friend listed on Gina:', G.locator('text=Hasan Ali').count() >= 1)

    # Hasan hosts a room, invites Gina → toast on Gina's screen → Join
    H.goto('http://127.0.0.1:3000/?view=online'); time.sleep(0.8)
    H.get_by_role('button', name='2', exact=True).click(); H.get_by_role('button', name='Create Private Room').click()
    H.wait_for_selector('text=Invite friends', timeout=10000); time.sleep(0.8)
    H.get_by_role('button', name=re.compile('Gina')).click()
    G.wait_for_selector('text=invited you to play', timeout=8000)
    G.screenshot(path='/tmp/sapludu-shots/41-invite-toast.png')
    G.get_by_role('region', name=re.compile('Notifications')).get_by_role('button', name='Join').click()
    H.wait_for_selector('text=Gina The Great', timeout=10000)
    print('invitee joined host room via toast: True')

    # leaderboard page renders for a signed-in user
    G.get_by_role('button', name=re.compile('Leaderboard')).first.click(); time.sleep(1)
    G.screenshot(path='/tmp/sapludu-shots/42-leaderboard.png')

    # admin: allowed vs forbidden
    menu(ADM, 'Admin')
    ADM.wait_for_selector('[data-testid=admin-users]', timeout=10000)
    print('admin sees users:', ADM.locator('[data-testid=admin-users] li').count())
    ADM.screenshot(path='/tmp/sapludu-shots/43-admin.png')
    H.get_by_label('Account menu').click(); time.sleep(0.3)
    print('non-admin has admin menu entry:', H.get_by_role('menuitem', name=re.compile('Admin')).count() > 0)
    H.keyboard.press('Escape')
    # force-open admin view as a normal user: backend must refuse
    res = H.evaluate("""async () => { const t = localStorage.getItem('sapludu-session');
      const r = await fetch('http://127.0.0.1:8787/exec', {method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action:'admin.users', sessionToken:t, payload:{}})});
      return (await r.json()); }""")
    print('direct admin API call by normal user ->', res)
    b.close()
