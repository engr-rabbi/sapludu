"""Drives the production static build in two headless browsers (desktop + Android-sized phone):
sign in with (fake) Google → create room → join by code → ready → start → play to the end → check results."""
import re, sys, time, json, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_google import install
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get('SHOTS', '/tmp/sapludu-shots'); os.makedirs(SHOTS, exist_ok=True)
def sign_in(pg):
    pg.goto('http://127.0.0.1:3000/')
    pg.get_by_role('button', name='Sign In').first.click()
    pg.locator('#fake-google-btn').click()
    pg.wait_for_selector('text=Welcome back', timeout=10000)

with sync_playwright() as p:
    b = p.chromium.launch()
    a_ctx = b.new_context(viewport={'width': 1280, 'height': 860})
    b_ctx = b.new_context(**p.devices['Pixel 7'])
    install(a_ctx, 'alice@example.com', 'Alice Rahman')
    install(b_ctx, 'bob@example.com', 'Bob Chowdhury')
    A = a_ctx.new_page(); B = b_ctx.new_page()
    errs = []
    for n, pg in (('A', A), ('B', B)):
        pg.on('pageerror', lambda e, n=n: errs.append(f'{n} PAGEERR {e}'))
        pg.on('console', lambda m, n=n: errs.append(f'{n} {m.text}') if m.type == 'error' and 'ERR_NAME_NOT_RESOLVED' not in m.text else None)
    sign_in(A); sign_in(B)

    # Alice creates a 2-player room
    A.goto('http://127.0.0.1:3000/?view=online')
    A.get_by_role('button', name='2', exact=True).click()
    A.get_by_role('button', name='Create Private Room').click()
    A.wait_for_selector('button[aria-label="Copy room code"]', timeout=10000)
    code = A.locator('button[aria-label="Copy room code"]').inner_text().strip()
    code = re.sub(r'[^A-Z0-9]', '', code)
    print('room code', code)
    A.screenshot(path=f'{SHOTS}/10-lobby-host.png')

    # Bob joins with the code on the phone
    B.goto('http://127.0.0.1:3000/?view=online')
    B.get_by_placeholder('ABC123').fill(code)
    B.get_by_role('button', name='Join with Code').click()
    B.wait_for_selector('text=Alice Rahman', timeout=10000)
    B.get_by_role('button', name='Ready', exact=True).click()
    A.wait_for_selector('text=Bob Chowdhury', timeout=10000)
    time.sleep(0.5)
    B.screenshot(path=f'{SHOTS}/11-lobby-guest-mobile.png')
    A.screenshot(path=f'{SHOTS}/12-lobby-host-2.png')
    A.get_by_role('button', name='Start Game').click()

    # in game
    for pg in (A, B):
        pg.get_by_role('button', name=re.compile('Roll Dice|Rolling')).first.wait_for(timeout=15000)
    time.sleep(1.2)
    A.screenshot(path=f'{SHOTS}/13-game-desktop.png')
    B.screenshot(path=f'{SHOTS}/14-game-mobile.png')

    rolls = 0
    t0 = time.time()
    shot_mid = False
    while time.time() - t0 < 150:
        done = any(pg.locator('[aria-label="Game result"]').count() for pg in (A, B))
        if done: break
        for pg in (A, B):
            btn = pg.get_by_role('button', name='Roll Dice')
            if btn.count() and btn.first.is_enabled():
                try:
                    btn.first.click(timeout=500); rolls += 1
                except Exception: pass
        if rolls == 12 and not shot_mid:
            shot_mid = True
            A.screenshot(path=f'{SHOTS}/15-mid-desktop.png'); B.screenshot(path=f'{SHOTS}/16-mid-mobile.png')
        time.sleep(0.12)
    print('rolls clicked', rolls, 'elapsed', round(time.time() - t0, 1))
    A.wait_for_selector('[aria-label="Game result"]', timeout=20000)
    B.wait_for_selector('[aria-label="Game result"]', timeout=20000)
    time.sleep(2.5)  # let game:rated arrive
    A.screenshot(path=f'{SHOTS}/17-result-desktop.png'); B.screenshot(path=f'{SHOTS}/18-result-mobile.png')

    state = json.load(urllib.request.urlopen('http://127.0.0.1:8787/state'))
    games = state['Games']; users = state['Users']
    print('Games rows', len(games) - 1, '| mode', games[1][2], '| status', games[1][3], '| turns', games[1][8])
    for u in users[1:]:
        print('user', u[3], 'played', u[11], 'won', u[12], 'rating', u[14], 'rank', u[15])
    print('moves stored', len(state['GameMoves']) - 1)
    print('JS errors:', errs[:8])
    b.close()
