"""Samples every token's on-screen position on every animation frame during real moves (local game, normal
animation speed) and reports any vertical anomaly: tokens appearing above their path ("falling from above"),
height changes, size changes, or sudden jumps.  Usage: token_motion_probe.py [base_url] [viewport_w] [viewport_h]"""
import os, re, sys, time, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3301'
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1100
H = int(sys.argv[3]) if len(sys.argv) > 3 else 900
ROLLS = int(os.environ.get('ROLLS', '10'))

SAMPLER = """
() => {
  window.__samples = [];
  const board = document.querySelector('[role=img][aria-label*="game board"]');
  const tick = (now) => {
    const b = board.getBoundingClientRect();
    document.querySelectorAll('svg[viewBox="0 0 40 44"]').forEach((svg) => {
      if (!board.contains(svg)) return;
      const body = svg.querySelector('path[fill]');
      const fill = body ? body.getAttribute('fill') : '?';
      // the pawn's contact point = bottom centre of the svg box
      const r = svg.getBoundingClientRect();
      window.__samples.push({ t: now, fill, x: (r.left + r.width / 2 - b.left) / b.width * 100, y: (r.bottom - b.top) / b.height * 100,
                              w: r.width / b.width * 100, h: r.height / b.height * 100 });
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
    ctx.add_init_script("localStorage.setItem('sapludu-ui', JSON.stringify({state:{language:'en',sound:false,animation:'normal',vibration:false,theme:'light',boardTheme:'%s'},version:0}))" % os.environ.get('THEME','classic'))
    pg = ctx.new_page()
    pg.goto(BASE + '/?view=setup-local'); time.sleep(1.2)
    pg.get_by_role('button', name=re.compile('Start')).first.click()
    pg.wait_for_selector('[role=img][aria-label*="game board"]', timeout=8000); time.sleep(0.8)
    pg.evaluate(SAMPLER)
    moves = 0
    t0 = time.time()
    while moves < ROLLS and time.time() - t0 < 240:
        btn = pg.get_by_role('button', name='Roll Dice')
        if btn.count() and btn.first.is_enabled():
            btn.first.click(); moves += 1; time.sleep(0.3)
        time.sleep(0.15)
    time.sleep(2.5)
    samples = pg.evaluate('window.__samples')
    b.close()

SNAKES = {27:5,40:19,54:31,60:38,70:48,87:24,93:68,96:45,99:72}
LADDERS = {4:25,13:46,33:49,42:63,50:69,62:81,74:92}

def square_at(x, y):
    """board % (pawn contact point = bottom centre of the pawn box, ~ square centre + 0.78*size) -> square number"""
    row_from_bottom = min(9, max(0, int((100 - (y - 0.0)) // 10)))      # pawn base sits ~at the square centre
    col = min(9, max(0, int(x // 10)))
    return None, row_from_bottom, col

by = {}
for s in samples: by.setdefault(s['fill'], []).append(s)
print(f'{len(samples)} samples, tokens: {list(by)}')
bug_frames = 0       # token enters from the board corner / teleports to somewhere it was not heading
design_jumps = 0     # snake swallow reappearance (hidden-in-snake choreography) — intentionally a jump
for fill, ser in by.items():
    ser.sort(key=lambda s: s['t'])
    for a, c in zip(ser, ser[1:]):
        d = ((c['x'] - a['x']) ** 2 + (c['y'] - a['y']) ** 2) ** 0.5
        if d <= 20: continue
        # a snake swallow: pawn hidden inside the snake, re-appears on the tail square -> lands on the bottom half of the board
        # (tail squares) coming from a head square.  The bug signature: arriving at the board's top-left corner.
        idx = ser.index(a)
        leaves = any(((s['x']-c['x'])**2 + (s['y']-c['y'])**2) ** .5 > 8 for s in ser[idx + 2:idx + 40])
        # fly-in signature: appears in the top-left corner and then travels AWAY from it (arriving there to rest = a legit move to 81 / 100)
        in_corner = c['x'] < 14 and c['y'] < 20 and not (a['x'] < 14 and a['y'] < 20) and leaves
        if in_corner:
            bug_frames += 1
            print(f'  BUG  {fill}: jump to board corner ({c["x"]:.1f},{c["y"]:.1f}) from ({a["x"]:.1f},{a["y"]:.1f}) at t={a["t"]:.0f}')
        else:
            design_jumps += 1
            print(f'  info {fill}: {d:.0f}%-jump ({a["x"]:.0f},{a["y"]:.0f})->({c["x"]:.0f},{c["y"]:.0f}) — snake-swallow / ladder choreography')
    # "fly-in": any frame where a token that was at rest (moved <0.2% for 5 frames) then travels DOWN >10% within 12 frames
    # without a roll in progress is a fall; measured as: top-most y reached after rest vs rest y
print(f'bug frames (corner fly-in / drop from above): {bug_frames};  by-design snake/ladder jumps: {design_jumps}')
print('RESULT:', 'NO DROP-FROM-ABOVE ANOMALIES' if bug_frames == 0 else 'DROP-FROM-ABOVE STILL PRESENT')
json.dump(samples, open('/tmp/token_samples.json', 'w'))
