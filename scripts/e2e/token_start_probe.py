"""Records pawn positions from the very first frame they exist (game start) and reports whether any pawn enters
from the board corner / moves vertically before the first roll.  Usage: token_start_probe.py base_url [w h]"""
import os, re, sys, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 390; H = int(sys.argv[3]) if len(sys.argv) > 3 else 844
THEME = os.environ.get('THEME', 'classic')
INIT = """
window.__first = [];
const loop = (now) => {
  const board = document.querySelector('[role=img][aria-label*="game board"]');
  if (board) { const b = board.getBoundingClientRect();
    document.querySelectorAll('svg[viewBox="0 0 40 44"]').forEach(svg => { if (!board.contains(svg)) return;
      const r = svg.getBoundingClientRect(); const f = svg.querySelector('path[fill]').getAttribute('fill');
      window.__first.push({t: now, f, x: (r.left + r.width/2 - b.left)/b.width*100, y: (r.bottom - b.top)/b.height*100}); }); }
  if (window.__first.length < 400) requestAnimationFrame(loop);
}; requestAnimationFrame(loop);
"""
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': W, 'height': H}, is_mobile=W < 700, has_touch=W < 700)
    ctx.add_init_script("localStorage.setItem('sapludu-ui', JSON.stringify({state:{language:'en',sound:false,animation:'normal',vibration:false,theme:'light',boardTheme:'%s'},version:0}))" % THEME)
    pg = ctx.new_page(); pg.goto(BASE + '/?view=setup-local'); time.sleep(1.0)
    pg.evaluate(INIT)
    pg.get_by_role('button', name=re.compile('Start')).first.click(); time.sleep(2.5)
    S = pg.evaluate('window.__first'); b.close()
by = {}
for s in S: by.setdefault(s['f'], []).append(s)
bad = 0
for f, ser in by.items():
    ys = [s['y'] for s in ser]; xs = [s['x'] for s in ser]
    first = (round(xs[0], 1), round(ys[0], 1)); last = (round(xs[-1], 1), round(ys[-1], 1))
    travel = round(max(abs(xs[i+1]-xs[i])+abs(ys[i+1]-ys[i]) for i in range(len(ser)-1)), 2)
    vertical = round(max(ys) - min(ys), 2)
    from_corner = first[1] < 30
    bad += from_corner
    print(f'  {f}: first frame {first} -> settled {last}; vertical range {vertical}%, largest frame step {travel}% {"<-- enters from above" if from_corner else ""}')
print('RESULT:', 'PAWNS APPEAR IN PLACE (no drop)' if not bad else 'PAWNS DROP IN FROM ABOVE')
