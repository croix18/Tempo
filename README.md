# Tempo

A chess trainer in one HTML file. Open `dist/Tempo.html` in any browser on a computer, phone or tablet. It needs no install, no account and no network.

## What's in it

- **Play** 61 characters in six tiers of ten (the Chaos Crew, the Beginners, the Club Players, the Contenders, the Masters and the Legends) plus a bonus challenger. Three wins in your tier open its promotion match against the tier's top character; win it to move up. Beating Batman brings out the Joker, and beating or drawing Homer Simpson makes you the Tempo Champion. Or start at your Chess.com rating. Optional coach warnings with the punishing reply drawn on the board (or, with Ask me first, a question that has you find the problem on the board before the coach explains), threat warnings (pieces you could lose and checkmate threats), hints that say why a move is good, takebacks and clocks.
- **The characters** each play their own way. Strength comes from the rating (the built-in engine below 2000, Stockfish for the Masters and Legends), and personality chooses among the moves that strength allows: style weights from the character's archetype and seven traits (attack, risk, theory, defense, tricks, trades, endgames) for forks, pins, discovered attacks, sacrifices, retreats, pawn chains, king attacks and more; position-aware opening books for White and for Black against 1.e4 and 1.d4, which end as soon as you leave them; and a signature line said at a moment that really happened on the board. Each character's sheet shows its traits as a radar, how it plays, its favorite tricks, its weak spot and its openings. Opponent chat can be Off, Some or Lots.
- **Review** any game with Stockfish: a summary up top with both sides' accuracy and a count of every kind of move from brilliant to blunder (tap one to step through those moves), your mistakes first, move-by-move labels (best, inaccuracy, mistake, blunder and so on) double-checked before a move is called bad, plain-language explanations, a retry of each mistake graded against the best move, and where the game left an opening line you've learned (that line goes first in your drills).
- **Chess clock** for a game on a real board: the screen becomes a two-sided clock (on a phone or tablet held upright, the far half faces the other player). Tap your half after you move. Common times or your own, extra seconds per move, more time for one player, pause, and the clock keeps the screen on where the browser allows it.
- **Puzzles**: about 9,000 rated Lichess puzzles, a daily puzzle, and practice by theme.
- **Learn**: 8 units, 42 interactive lessons, from the basics through tactics, mates, opening principles, endgames, strategy and how to think during a game.
- **Openings**: three repertoires (1.e4 with the Italian, and 1...e5 and 1...d5 as Black) with drills on spaced repetition, plus 10 traps to spring or avoid.
- **Home** lists what to do next, what fixes your games first: your mistake pattern, positions to retry, an unreviewed game, the puzzle theme you miss most, lines to drill, today's puzzle, the next lesson, and a reminder to back up once there's real progress and no backup for a month (only in a browser without the account sync).
- **Your pattern**: saved mistakes carry their kind (a piece left en prise, a fork, a missed mate, and so on), and the kind that shows up in the most of your recent games is named on Home, at the end of a game and after each review, with the lesson, puzzles and positions that fix it. Home lists what to do next in that order, with a rough time for each.
- **Trainers**: coordinates, board vision, a review queue of your own mistakes, mating and endgame play-outs, and an analysis board.
- **Progress**: rating history, a practice calendar and stats. Data stays in the browser and is checked and repaired every time it loads, with backup and restore to a file. When it runs as a Claude artifact, progress syncs across devices.
- **Pieces and badges**: an original Staunton-style set drawn for Tempo, in ivory and navy, and an original badge for each character: its initials on its tier's colour with a mark for how it plays (src/ui/avatars.js). The characters themselves are never drawn.

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

The characters live in `content/characters.json`: each profile's identity, openings, tactics, plan, weakness, signature event, traits and dialogue, as written in the personality pack, with Tempo's additions (short name, monogram, win line, signature triggers, opening families and the promotion-match flag). Their opening families are in `src/book.js`. The ratings are difficulty targets on the scale of the original ladder, not official ratings; `tests/calibrate.js` measures each character below 2000 and the small corrections it found are in `NUDGE` in `src/bots.js`. Above 2000 there are fewer yardsticks: the Masters search Stockfish to a set depth, chosen so that Batman scores a little better than Celeste, the original 2000, and than Princess Peach, the top Contender, and the Legends search deeper again (`node tests/chars.js match <a> <b>`).

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
node tests/ladder.js 20      # every original ladder bot beats the one below it (about 10 minutes); they are the yardsticks
node tests/book_test.js      # every opening book line is legal, side-aware, and leaves the book on a deviation
node tests/verify_book.js 12 # every book move checked with Stockfish (about 15 minutes)
node tests/calibrate.js 12   # each character below 2000 against the yardsticks around its rating
node tests/chars.js style 4  # how often each character does what its profile says it likes
node tests/chars.js match batman celeste 8   # one pairing, for the Stockfish tiers
```

The browser tests (`build/*_test.py`, `build/lessons_qa.py`, `build/openings_qa.py`) use Playwright for Python. `build/run_all.sh` runs them all against one build. They run Chrome from `$CHROME` or `/usr/bin/google-chrome`, or Playwright's own Chromium if neither exists. For example, `python3 build/lessons_qa.py tactics` plays through every lesson in a unit.

## Layout

```
src/core.js         rules: move generation, SAN, PGN, FEN
src/engine.js       built-in engine and bot move selection
src/bots.js         the characters: tiers, strength from the rating, style from the profile, unlocking
src/book.js         the characters' opening books, indexed by position
content/characters.json  the 61 character profiles (the personality pack, plus Tempo's additions)
src/ui/             the app: board, play, review, puzzles, learn, openings, trainers, progress
content/            lessons, opening repertoires and the character profiles
docs/characters/    the character bible and personality engine spec from the personality pack
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
