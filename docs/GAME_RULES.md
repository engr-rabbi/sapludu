# SAPLUDU Game Rules — সাপলুডু খেলার নিয়ম

Complete rules reference for SAPLUDU. Key terms are given in English (EN) and Bangla (BN). This document matches the implemented engine exactly; nothing here is aspirational.

---

## 1. Objective

Players race their tokens from square 1 to square 100 along a zigzag path, climbing ladders (মই) and dodging snakes (সাপ). The first player to land **exactly** on square 100 wins (জয়).

EN: Snakes and Ladders — BN: সাপলুডু / সাপ ও মই খেলা
Tagline: Play. Climb. Win. — খেলো। ওঠো। জিতো।

### Key terms (EN → BN)

| English | Bangla |
| --- | --- |
| Dice | ছক্কা / পাশা |
| Roll | ছক্কা চালা / গড়ানো |
| Turn | পালা |
| Square / cell | ঘর |
| Ladder | মই |
| Snake | সাপ |
| Token / piece | ঘুঁটি |
| Extra turn | অতিরিক্ত পালা |
| Exact finish | হুবহু শেষ ঘরে পৌঁছানো |
| Overshoot | লক্ষ্য ছাড়িয়ে যাওয়া |
| Win / winner | জয় / বিজয়ী |
| Move | চাল |

---

## 2. Board Layout

- 10x10 grid, 100 squares.
- Zigzag (boustrophedon) numbering: square 1 is bottom-left; the path runs left-to-right on the first row, then reverses direction on each following row, ending with square 100 at the top-left.
- Tokens start on square 1; any roll moves a token (there is no "roll a 6 to enter" rule in this game).

Grid (as displayed, top row first):

| Row | Squares, left to right |
| --- | --- |
| 10 | 100 99 98 97 96 95 94 93 92 91 |
| 9 | 81 82 83 84 85 86 87 88 89 90 |
| 8 | 80 79 78 77 76 75 74 73 72 71 |
| 7 | 61 62 63 64 65 66 67 68 69 70 |
| 6 | 60 59 58 57 56 55 54 53 52 51 |
| 5 | 41 42 43 44 45 46 47 48 49 50 |
| 4 | 40 39 38 37 36 35 34 33 32 31 |
| 3 | 21 22 23 24 25 26 27 28 29 30 |
| 2 | 20 19 18 17 16 15 14 13 12 11 |
| 1 | 1 2 3 4 5 6 7 8 9 10 |

---

## 3. Ladders and Snakes (final adopted configuration)

### 3.1 Ladders — মই (7)

| # | Foot (bottom) | Head (top) | Climb length |
| --- | --- | --- | --- |
| 1 | 4 | 25 | +21 |
| 2 | 13 | 46 | +33 |
| 3 | 33 | 49 | +16 |
| 4 | 42 | 63 | +21 |
| 5 | 50 | 69 | +19 |
| 6 | 62 | 81 | +19 |
| 7 | 74 | 92 | +18 |

BN: মইয়ের নিচের ঘরে পড়লে ঘুঁটি উপরের ঘরে উঠে যায়।

### 3.2 Snakes — সাপ (9)

| # | Head (top) | Tail (bottom) | Slide length |
| --- | --- | --- | --- |
| 1 | 27 | 5 | -22 |
| 2 | 40 | 19 | -21 |
| 3 | 54 | 31 | -23 |
| 4 | 60 | 38 | -22 |
| 5 | 70 | 48 | -22 |
| 6 | 87 | 24 | -63 |
| 7 | 93 | 68 | -25 |
| 8 | 96 | 45 | -51 |
| 9 | 99 | 72 | -27 |

BN: সাপের মাথায় পড়লে ঘুঁটি লেজের ঘরে নেমে যায়।

### 3.3 Board integrity guarantees

The engine validates the configuration at construction time:

1. Every ladder climbs upward; every snake slides downward.
2. No two snakes or ladders share a start square.
3. No snake tail lands on a ladder foot — chains are impossible.
4. Nothing starts or ends on square 100; only the exact win condition uses it.

---

## 4. Turn Rules

1. Players take turns in fixed order (2–4 players).
2. On your turn, roll the dice (1–6) and advance your token by that many squares along the zigzag path.
3. **Rolling a 6 grants exactly one extra turn.** There is no triple-six penalty in this game.
4. After resolving movement (including any ladder climb or snake slide), play passes to the next player — unless the roll was a 6 and the game has not ended.

### Move resolution

- Destination = current square + dice.
- If destination is a ladder foot → climb to the ladder head (animation kind `ladder`).
- If destination is a snake head → slide to the snake tail (kind `snake`).
- Otherwise plain advance (kind `normal`).

---

## 5. Edge Cases

### 5.1 Exact finish (হুবহু শেষ)

Reaching square 100 requires an exact roll. If your token is on 97, you must roll exactly 3 to win. Landing on 100 by a direct step ends the game immediately with you as winner.

### 5.2 Overshoot (লক্ষ্য ছাড়িয়ে যাওয়া)

If current + dice exceeds 100, the token **stays where it is** — the roll is wasted. Example: token on 98, roll 5 → token remains on 98 (move kind `overshoot`). You keep playing until an exact roll carries you to 100.

### 5.3 Six extra turn (ছক্কায় অতিরিক্ত পালা)

A roll of 6 grants one additional roll for the same player. If that extra roll also finishes the game exactly, the game ends; otherwise the extra turn follows all normal movement rules.

### 5.4 Multiple tokens on the same square (একই ঘরে একাধিক ঘুঁটি)

Unlike Ludo, there is **no blocking and no capturing**. Two or more tokens may rest on the same square; they co-exist, rendered with a small visual offset so every token remains visible. Passing over or landing on an occupied square has no effect on other players.

### 5.5 No chains

Snake tails never sit on ladder feet (and no start square is shared), so a single move resolves exactly one transition — you never climb a ladder that turns into a snake, or slide into a ladder.

### 5.6 Start of game

All tokens begin on square 1. Any dice value moves the token; no special entry rule exists.

---

## 6. Winning and Results

- The game ends the moment a player's token lands exactly on square 100 (by direct step — never beyond, never via snake or ladder beyond the win).
- Final placements: remaining players are ranked by position for the results screen (`game:completed` carries `winnerIndex` and `results`).
- Rating consequences:
  - Online human-vs-human games update Elo ratings (K=32, start 1000) and the leaderboard.
  - Local and Player-vs-Computer games update personal statistics and achievements only — never Elo or leaderboards.

---

## 7. Fairness of the Dice

- Online mode: the server rolls with Node's cryptographic `crypto.randomInt(1, 7)`. Clients never influence the value; duplicate roll requests within the same turn are rejected.
- Local and Player-vs-Computer modes: the dice comes from the browser's `Math.random()`.
- AI opponents always receive fair random dice. Difficulty (Easy/Normal/Hard) changes only how long the AI "thinks" and how expressive its emotes are — never the dice.

BN: কম্পিউটার প্রতিপক্ষ সবসময় ন্যায্য ছক্কা ব্যবহার করে; কঠিন মানে শুধু ভাবার সময় ও আচরণ, কখনোই ছক্কায় প্রভাব নয়।

---

## 8. Online Play Notes

- Turn timeout: 40 seconds; if you do not roll, the server auto-rolls for you (`turn:changed` reports the reason).
- Disconnects: if your connection drops, others see `player:disconnected`; you have a 90-second grace period to reconnect and receive a full state resync (`game:state_sync`).
- Forfeit: you may leave an active game voluntarily; the game completes with updated placements.

BN: অনলাইন খেলায় ৪০ সেকেন্ডের মধ্যে ছক্কা না গড়ালে সার্ভার স্বয়ংক্রিয়ভাবে গড়িয়ে দেয়; বিচ্ছিন্ন হলে ৯০ সেকেন্ড সময় পাওয়া যায় পুনরায় যুক্ত হতে।

---

## 9. Quick Reference (এক নজরে)

- Board: 10x10 = 100 squares, zigzag path (১০x১০, জিগজ্যাগ পথ)
- Start: square 1, all tokens (ঘর ১ থেকে শুরু)
- Win: exact landing on 100 (হুবহু ১০০-তে পৌঁছালে জয়)
- Overshoot: stay in place (ছাড়িয়ে গেলে জায়গায় থেকে যাওয়া)
- Six: one extra turn (ছক্কায় এক অতিরিক্ত পালা)
- Ladders: 7 (৭টি মই)
- Snakes: 9 (৯টি সাপ)
- Blocking/capturing: none (কোনো আটকানো বা কাটাকাটি নেই)
- Same-square stacking: allowed with visual offset (একই ঘরে একাধিক ঘুঁটি থাকতে পারে)
