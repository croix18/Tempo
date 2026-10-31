# Tempo

A chess trainer in one HTML file. Open `dist/Tempo.html` in any browser on a computer, phone or tablet. It needs no install, no account and no network.

## What's in it

- **Play** 14 bots, from Pip (about 250) to full-strength Stockfish. Each win unlocks the next bot, or start at your Chess.com rating. Optional coach warnings with the punishing reply drawn on the board, threat warnings (pieces you could lose and checkmate threats), hints that say why a move is good, takebacks and clocks.
- **Review** any game with Stockfish: a summary up top with both sides' accuracy and a count of every kind of move from brilliant to blunder (tap one to step through those moves), your mistakes first, move-by-move labels (best, inaccuracy, mistake, blunder and so on) double-checked before a move is called bad, plain-language explanations, a retry of each mistake graded against the best move, and where the game left an opening line you've learned (that line goes first in your drills).
- **Chess clock** for a game on a real board: the screen becomes a two-sided clock (on a phone or tablet held upright, the far half faces the other player). Tap your half after you move. Common times or your own, extra seconds per move, more time for one player, pause, and the clock keeps the screen on where the browser allows it.
- **Puzzles**: about 9,000 rated Lichess puzzles, a daily puzzle, and practice by theme.
- **Learn**: 8 units, 42 interactive lessons, from the basics through tactics, mates, opening principles, endgames, strategy and how to think during a game.
- **Openings**: three repertoires (1.e4 with the Italian, and 1...e5 and 1...d5 as Black) with drills on spaced repetition, plus 10 traps to spring or avoid.
- **Trainers**: coordinates, board vision, a review queue of your own mistakes, mating and endgame play-outs, and an analysis board.
- **Progress**: rating history, a practice calendar and stats. Data stays in the browser and is checked and repaired every time it loads, with backup and restore to a file. When it runs as a Claude artifact, progress syncs across devices.
- **Pieces**: an original Staunton-style set drawn for Tempo, in ivory and navy.

## Build

Needs Node 18+ and Python 3.

```sh
python3 build/build.py      # writes dist/Tempo.html and dist/tempo-artifact.html
```

`dist/Tempo.html` is the standalone file. `dist/tempo-artifact.html` is the same app without the document wrapper, for publishing as a Claude artifact.

The engine, fonts, puzzles and opening names are packed into `build/*.b64`. Rebuild those only if something in `assets/` or `data/` changes:

```sh
node tests/prep_data.js
```

## Content

Lessons live in `content/lessons/u1-basics.js` to `u8-thinking.js`, and openings in `content/openings.js`. The format and style rules are in `docs/CONTENT_SPEC.md`. Check content with Stockfish before building:

```sh
node tests/verify_lessons.js content/lessons/u4-tactics.js   # one unit at a time
node tests/verify_openings.js content/openings.js
node tests/annotate_traps.js                                  # writes build/traps_meta.json, used by the build
```

## Tests

```sh
node tests/perft.js          # move generator
node tests/engine_test.js    # built-in engine
```

The browser tests (`build/*_test.py`, `build/lessons_qa.py`, `build/openings_qa.py`) use Playwright for Python. `build/run_all.sh` runs them all against one build. They run Chrome from `$CHROME` or `/usr/bin/google-chrome`, or Playwright's own Chromium if neither exists. For example, `python3 build/lessons_qa.py tactics` plays through every lesson in a unit.

## Layout

```
src/core.js         rules: move generation, SAN, PGN, FEN
src/engine.js       built-in engine and bot move selection
src/bots.js         the bot ladder and opening books
src/ui/             the app: board, play, review, puzzles, learn, openings, trainers, progress
content/            lessons and opening repertoires
assets/, data/      Stockfish, fonts, puzzle and opening data
build/build.py      packs everything into one file
tests/              rules, engine and content checks
tools/push.sh       commit and push from a Claude session
```

## Pushing from a Claude session

`tools/push.sh "message"` commits everything and pushes to `main`. It reads a fine-grained token (Contents: read and write, this repository only) from `.github-token`, which is git-ignored and must never be committed.

## Credits

- Stockfish 10 by the Stockfish developers, compiled to WebAssembly as [stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg. GPL-3.0; source at [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish).
- Puzzles from the [Lichess puzzle database](https://database.lichess.org/#puzzles) and opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), both CC0.
- DM Sans and DM Serif Display, SIL Open Font License 1.1.
- The chess pieces were drawn for this project.
