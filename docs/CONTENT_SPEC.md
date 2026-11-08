# Tempo content spec — lessons and openings

Tempo is a single-file chess trainer for an adult beginner (Chess.com rating under ~800)
who wants to become a solid club player. Lessons are interactive: every step shows a
board, and most steps ask the learner to do something on it.

## File layout

One CommonJS module per unit in `content/lessons/`, named `uN-slug.js`:

```js
module.exports = {
  id: 'tactics',                 // unique, lowercase-hyphen
  title: 'Tactics',              // plain title, 1–3 words
  summary: 'Win material with forks, pins, skewers and more.', // one sentence, shown on the unit card
  lessons: [
    {
      id: 'fork',                // unique across ALL units
      title: 'Forks',
      summary: 'One piece attacks two things at once.',   // one short sentence
      steps: [ /* 5–9 steps, see below */ ]
    }
  ]
};
```

## Step types

Every step has `t` (type) and `text`. `fen` is required unless noted. The board is shown
from the side to move unless `orient: 'w'` or `orient: 'b'` is given. All moves are UCI (except the SAN `moves` of walk, line, safe and game)
strings (`e2e4`, `e7e8q`, castling as king move `e1g1`). Squares are lowercase (`e4`).

1. **read** — explanation with a picture.
   `{ t: 'read', fen, text, arrows?: ['e2e4', ...], marks?: ['e4', ...], play?: ['e2e4','e7e5'] }`
   `arrows` are drawn as arrows (from-to). `marks` highlight squares. `play` (optional) animates
   these moves from the fen when the step opens (a Replay button appears).

2. **move** — find the move(s).
   `{ t: 'move', fen, text, line: ['d4e6', 'd8d7', 'e6c7'], hint, done, accept?, mate?, wrong? }`
   - `line` alternates learner move, computer reply, learner move ... and must END with a learner move.
   - `accept` (optional): array the same length as `line`; entry i is a list of extra UCI moves
     that also count for learner ply i (use when the checker says another move is equally good).
   - `mate: true` — any checkmating move is accepted on the final learner ply.
   - `hint`: one sentence that nudges without giving the move away.
   - `done`: 1–2 sentences shown after success explaining WHY it works.
   - `wrong` (optional): `{ 'uci': 'feedback for this specific wrong move' }`.

3. **pick** — click squares.
   `{ t: 'pick', fen, text, squares: ['c6','g5'], done }`
   The learner selects squares and presses Check. Correct = exactly these squares.
   Use for "click every hanging piece", "click every square the knight attacks", etc.

4. **quiz** — multiple choice (fen optional).
   `{ t: 'quiz', fen?, text, choices: ['…','…','…'], answer: 1, done }` (`answer` is a 0-based index; 2–4 choices. The player shows the choices in a new order each time, so a choice must make sense on its own: no "both of the above".)

5. **play** — play it out against the computer.
   `{ t: 'play', fen, text, goal, limit?, done }`
   - `goal: 'mate'` — checkmate within `limit` learner moves (the computer defends perfectly).
   - `goal: 'promote'` — promote a pawn (and keep it).
   - `goal: 'draw'` — reach a draw (stalemate, repetition, insufficient material, or still level after `limit` moves).
   - `goal: 'win'` — reach a decisive advantage (+5 or mate) within `limit` moves.
   Use `play` for endgame techniques (queen mate, rook mate, opposition, Philidor, Lucena).

6. **walk** — step through a line of moves with Back and Next; a note appears after each move that has one.
   `{ t: 'walk', moves: 'e4 e5 Nf3 Nc6 Bc4', fen?, orient: 'w', text, notes: { 4: 'Why Bc4 …' }, end }`
   `moves` is SAN from the start (or from `fen`). `text` shows before the first move; note `k` explains move `k`
   (0-based) and shows right after it; `end` is the takeaway shown at the end.

7. **line** — the learner plays one side of a line; the computer plays the other side's moves from it.
   `{ t: 'line', moves: 'e4 e5 …', fen?, side: 'w', guide: true, text, done }`
   `guide: true` shows an arrow for each of the learner's moves (the first time through); `guide: false` is from
   memory: a wrong move is caught, and the second wrong try shows the line's move.

8. **safe** — find a good move. The computer plays `moves` first, then any move that keeps the position (the engine
   checks it against the best move) is accepted.
   `{ t: 'safe', moves: 'e4 e5 …' | fen, side: 'w', text, aim?: ['Nbd2'], bait?: 'Nxe5', punish?: ['Qg5', …], note }`
   `aim` names the moves the lesson recommends (praised as "Yes."); a `bait` move is always refused and `punish`
   plays out what happens after it; `note` follows a good move. With `aim`, a Hint button marks the piece of `aim[0]`,
   then draws the move, so put the clearest good move first. When the bait has played out, the player says what it cost
   ("That lets White give checkmate.", "You lost a knight for a pawn.", trades cancelling out); when nothing was lost
   on the board, give the reason in `baitNote`.

9. **game** — a practice game from move 1.
   `{ t: 'game', side: 'w', lines: ['e4 e5 Nf3 Nc6 Bc4 Bc5 …', …], until: 12, text, done }`
   While the game is in the lines, the opponent picks among them at random and the learner's moves must follow them;
   after that the learner plays on alone to move `until` and passes if not worse than about a pawn. A move that
   drops a pawn or more off the lines ends the game with the reason. The lines must agree on the learner's move
   wherever they share a position.

**Trap lessons** don't write steps by hand: `content/lessons/trap-lessons.js` builds each one from a trap in
`content/openings.js` (`{ t: 'walk', trap: id }`, a guided `line` to set it, a `safe` step to dodge it, and the line again
from memory). **Practice rounds**: a lesson whose idea has a puzzle theme (the map in `src/ui/learn.js`) gets five
puzzles of that theme added at its end. **Reviews**: every finished lesson comes back on a schedule of 1, 3, 7, 16 and
35 days; a review shows one or two of its interactive steps, fresh puzzles of its theme, its line from memory or its
practice game. Write every interactive step so it still makes sense on its own, days later.

## Writing style

- Talk to the learner directly, plainly, like a good coach at a club. Short sentences.
- 1–3 short sentences per step. Never more than ~45 words in a step's `text`.
- Name pieces in words and give the square: "the knight on f3", "your bishop on c4".
  You may use move notation too ("Nf3"), but explain new notation the first time.
- No emoji, no exclamation-mark spam (one at most per lesson), no "Let's dive in",
  no "Great job!" filler, no em-dash asides, no "It's not X, it's Y" constructions.
- `**bold**` is allowed for a key term the first time it appears. Use `\n\n` for a paragraph break.
- Positions should be clean and realistic: avoid clutter that distracts from the idea.
  Prefer positions that could come from a real game. Keep material sensible (no 3 queens).
- Every lesson ends with 2–3 practice steps (`move`, `pick` or `play`) that make the learner
  use the idea without the explanation in front of them.
- Make the learner side vary: some exercises as White, some as Black.

## Checking your work

Run `node tests/verify_lessons.js content/lessons/<file>.js` from the repository root.
It replays every position with Stockfish and reports:
- **ERROR** lines: illegal FEN or move, a learner move that is not good, a line that does not
  end on a learner move, wrong mate, malformed step. Fix every one.
- **WARN** lines: another learner move is just as good (add it to `accept` or change the position
  so the intended move is clearly best), a computer reply that isn't the best defense, etc.
  Fix them unless the warning is clearly harmless; explain any you leave in your report.

Run it until there are no ERROR lines.

## Openings file

`content/openings.js` exports `{ repertoires: [...], traps: [...] }`:

```js
{ id: 'italian', name: 'Italian Game', side: 'w', summary: 'one sentence',
  intro: '2–3 sentences on the plan of the opening',
  lines: [ { id: 'giuoco-piano', name: 'Giuoco Piano',
             moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6',   // SAN from the start position
             notes: { 0: 'Why 1.e4 ...', 4: 'Why Bc4 ...' } } ] }          // keys are 0-based ply indexes
```

Traps: `{ id, name, side: 'w'|'b' (the side the walkthrough is told from), summary, moves: 'SAN ...', notes: { ply: text }, lesson: 'what to remember in one sentence',
setter: 'w'|'b' (who sets the trap), key: ply (the victim's decision; moves[key] is the bait), safe: 'SAN' (the victim's best answer), safeNote,
bait?/punish? (when the line shows the right defense instead of the bait), noSet? (teach only the defense) }`

Check with `node tests/verify_openings.js content/openings.js` and `node tests/verify_traps.js` (set `SF_BIN` to a native
Stockfish for a deep check).
