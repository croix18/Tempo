# Tempo

A chess trainer in one HTML file. Open `dist/Tempo.html` in any browser on a computer, phone or tablet. It needs no install, no account and no network.

## What's in it

- **Play** 61 characters in six tiers of ten (the Chaos Crew, the Beginners, the Club Players, the Contenders, the Masters and the Legends) plus a bonus challenger. Three wins in your tier open its promotion match against the tier's top character; win it to move up. Beating Batman brings out the Joker, and beating or drawing Homer Simpson makes you the Tempo Champion. Or start at your Chess.com rating. Optional coach warnings with the punishing reply drawn on the board (or, with Ask me first, a question that has you find the problem on the board before the coach explains), threat warnings (pieces you could lose and checkmate threats), hints that say why a move is good, takebacks and clocks. A character's move is carried across the board at a natural pace, and the thoughtful ones (Velma, Sherlock, Yoda, Beth Harmon and others marked `"pace": "thoughtful"` in `content/characters.json`) stop to think for a moment first.
- **The characters** each play their own way. Strength comes from the rating (the built-in engine below 2000, Stockfish for the Masters and Legends), and personality chooses among the moves that strength allows: style weights from the character's archetype and seven traits (attack, risk, theory, defense, tricks, trades, endgames) for forks, pins, discovered attacks, sacrifices, retreats, pawn chains, king attacks and more; position-aware opening books for White and for Black against 1.e4 and 1.d4, which end as soon as you leave them.
- **The characters talk about the game in front of them**, each in its own voice: a line for hello, a rematch, a quiet move, a capture, giving check, being checked, your blunder, its own, its special moment, winning and losing, and a story in three beats that plays out in order when each moment really happens (Patrick's queen moves, works all day, then gets taken). Most talk; Psyduck and Pikachu only say their names, the Roblox Noob and the Crewmate type in a game chat, Freddy makes announcements, Mewtwo thinks, and Peely, Steve and Derpy Tiger never say a word. A line that claims something about the chess is said only when it's true: a fork, a sacrifice or a trap has to be on the board and a quick referee analysis has to agree; a blunder needs the referee's score before and after; "free stuff!" waits for a piece nobody guarded. Without the evidence the character says nothing. One remark per move at most, a quiet spell after each, never the same line twice in a game, and each character keeps its own pace (Batman, Vader and Beth say little; Patrick, Donkey and SpongeBob a lot). A remark about your move comes before the reply; a tap or Escape puts a line away. Opponent chat can be Off, Occasional or Frequent. The lines are the Character Voice V5 pack: original writing for Tempo, not quotes.
- **Each character's sheet** has two sides. About: who they are in their own story, Tempo's take on them and how they play, with a note that only the first comes from the source. How they play: their traits as a radar, their plan, favorite tricks, weak spot and openings.
- **Review** any game with Stockfish. While it reads the game, the board runs back to the start and replays it move by move under a gold scanner (the pieces fidget only while the engine stops to double-check a move), the graph draws itself and the coach keeps you company. Then a summary: the coach's sentence (how many key moments there are, and your best moment), a scorecard that reads straight down in two columns, yours beside your opponent's (accuracy, then how many moves of each kind from Brilliant to Blunder, with the kind's badge between the counts; tap a kind to step through those moves), and **Start review**, which walks through the key moments with one Next button (where the book ended, your best and worst moves, your opponent's blunders). On the way to each key moment the board plays the moves in between, so it never jumps. Your own mistakes keep the better move for you to find (Find a better move, graded against the best move) until you ask for it (Best move); Show the fork (or the capture, the threat, the checkmate) plays out the reply that punishes a move; **Play it out**, at any move, lets you play something else there (or the same move) against the engine, and plays the game on to the end (checkmate or a draw) if you like; **Fix your mistakes** goes through each of yours in turn. On a phone, Next (Start review on the summary) sits in a bar at the bottom of the screen. Move-by-move labels (best, inaccuracy, mistake, blunder and so on) are double-checked before a move is called bad, and every kind of move is counted from brilliant to blunder (tap one to step through those moves). The review also says where the game left an opening line you've learned (that line goes first in your drills).
- **Chess clock** for a game on a real board: the screen becomes a two-sided clock (on a phone or tablet held upright, the far half faces the other player). Tap your half after you move. Common times or your own, extra seconds per move, more time for one player, pause, and the clock keeps the screen on where the browser allows it.
- **Puzzles**: about 9,000 rated Lichess puzzles, a daily puzzle, and practice by theme.
- **Learn**: 12 units and 77 lessons. The first eight go from the basics through tactics, mates, opening principles, endgames, strategy and how to think during a game, and 16 of them, from forks to rook endgames, end with a practice round of five fresh puzzles on the idea. Two opening courses teach the **Italian Game** and the **Queen's Gambit** as White until you can run them: the idea behind each move, each line watched, then played with arrows, then from memory, the plans for the middlegame (the engine checks your move), the tactics that come up, the other side's view, and practice games from move 1 against an opponent who varies between the lines and then plays on, judged at move 12. Two trap units teach 16 opening traps four ways: watch it, set it, dodge it as the other side, then set it from memory, and sometimes the opponent doesn't take the bait and you have to play on well. Every finished lesson comes back for a short review 1, 3, 7, 16 and 35 days later (a line from memory, a dodge, a puzzle or a practice game), a miss brings it back the next day, and three right in a row locks it in. Learn, Home and Trainers say when reviews are due.
- **Openings**: the two courses, three repertoires (1.e4 with the Italian, and 1...e5 and 1...d5 as Black) with drills on spaced repetition, and 16 traps to spring or avoid, each opening its lesson.
- **Home** lists what to do next, what fixes your games first: your mistake pattern, positions to retry, an unreviewed game, the puzzle theme you miss most, lines to drill, today's puzzle, the next lesson, and a reminder to back up once there's real progress and no backup for a month (only in a browser without the account sync).
- **Your pattern**: saved mistakes carry their kind (a piece left en prise, a fork, a missed mate, and so on), and the kind that shows up in the most of your recent games is named on Home, at the end of a game and after each review, with the lesson, puzzles and positions that fix it. Home lists what to do next in that order, with a rough time for each.
- **Your games from Chess.com**: on the Review page, type your Chess.com username once and Get my games lists your games from the last three months (Chess.com's public data); tap one to add it and review it now, or add them all and Tempo reviews them one after another, in the background: go and play or practice meanwhile (the sidebar shows how far along they are, and a note says when they're done, after the game you're in). Your game always gets the engine first: a background search waits while a character thinks or a screen needs the engine, and stops at once when one does, so the characters play exactly as they would otherwise. Stop stops them; leaving an added game's own review before it's done hands it to the background. Where the browser blocks workers (the engine then runs on the page), the reviews wait while you're away from Review. Or paste a PGN, or open a file with many games. Your side comes from your username (or, in a file of several games, the name in every game). Added games are saved with your games in date order (the same game is never added twice, and it's the same game on every device), fill in the practice calendar on the days you played them, and once reviewed their mistakes go into your practice and Your pattern. They don't change Tempo's own rating. The Game Lab's copy has no network code, so it takes a pasted PGN only.
- **Trainers**: coordinates, board vision, a review queue of your own mistakes, mating and endgame play-outs, and an analysis board.
- **Keyboard**: the first Tab on any screen with a board is "Go to the board"; on the board, arrows steer a cursor and Enter picks up and drops, or type a move (Nf3, exd5, O-O) and it plays as soon as it names one legal move.
- **Progress**: rating history; **Your games**, every reviewed game (the characters' and Chess.com's alike): accuracy and mistakes a game over the last ten, accuracy game by game, what keeps going wrong with the lesson and puzzles that fix it, and your Chess.com rating from the games you added; a practice calendar and stats. Data stays in the browser and is checked and repaired every time it loads. A progress code (the whole save compressed into one pasteable string, about a tenth the size of the JSON) moves it to another device, where it can replace what's there or be combined with it; backup and restore to a file still work too. When it runs as a Claude artifact, progress syncs across devices.
- **Pieces and badges**: an original Staunton-style set drawn for Tempo in the language of the school's wolf: the knight is the snarling wolf, and the rest are cut like gems with a darker facet, fang merlons on the rook, a fang crown on the queen, and a dark wedge for the rook's window, the bishop's claw cut and the crown jewels; ivory and navy. An original badge for each character: its initials on its tier's color with a mark for how it plays (src/ui/avatars.js). The characters themselves are never drawn.

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

The characters live in `content/characters.json`: each profile's identity, openings, tactics, plan, weakness, signature event and traits, as written in the personality pack; its voice from the Character Voice V5 pack (who it is in its own story, Tempo's take, its chess style, how it talks and how often, its eleven lines, the evidence its special needs, and its story in three beats with the moment each one waits for); and Tempo's additions (short name, monogram, opening families, the promotion-match flag, `dialogue_requires` and `arc_requires`: what must be true on the board before a line that describes it can be said, and `special_guards`: the evidence for the specials the pack left without any). The writers' notes on each voice stay in the content file; the page never shows them. The build puts the voice in its own script for the page, so the engine worker doesn't carry it. Their opening families are in `src/book.js`. The ratings are difficulty targets on the scale of the original ladder, not official ratings; `tests/calibrate.js` measures each character below 2000 and the small corrections it found are in `NUDGE` in `src/bots.js`. Above 2000 there are fewer yardsticks: the Masters search Stockfish to a set depth, chosen so that Batman scores a little better than Celeste, the original 2000, and than Princess Peach, the top Contender, and the Legends search deeper again (`node tests/chars.js match <a> <b>`).

Lessons live in `content/lessons/u1-basics.js` to `u12-traps-more.js`, and openings and traps in `content/openings.js`. The two trap units build their lessons from the traps (`content/lessons/trap-lessons.js`), so a trap's moves and notes live in one place. The format and style rules are in `docs/CONTENT_SPEC.md`. Check content with Stockfish before building:

```sh
node tests/verify_lessons.js content/lessons/u4-tactics.js   # one unit at a time
node tests/verify_openings.js content/openings.js
node tests/verify_traps.js                                    # every trap: the bait loses, the safe answer holds, the notes' claims (SF_BIN=... for a deep check)
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
node tests/talk_test.js      # what the characters say: the V5 pack's ten regression checks, every kind of beat scripted, the pace
node tests/chars.js match batman celeste 8   # one pairing, for the Stockfish tiers
```

The browser tests (`build/*_test.py`, `build/lessons_qa.py`, `build/openings_qa.py`) use Playwright for Python. `build/run_all.sh` runs them all against one build. They run Chrome from `$CHROME` or `/usr/bin/google-chrome`, or Playwright's own Chromium if neither exists. For example, `python3 build/lessons_qa.py tactics` plays through every lesson in a unit.

## Layout

```
src/core.js         rules: move generation, SAN, PGN, FEN
src/engine.js       built-in engine and bot move selection
src/bots.js         the characters: tiers, strength from the rating, style from the profile, unlocking
src/book.js         the characters' opening books, indexed by position
src/talk.js         what the characters say: which line goes with a move, and the evidence a chess claim needs
content/characters.json  the 61 character profiles (the personality pack and the voice pack, plus Tempo's additions)
src/ui/             the app: board, play, review, puzzles, learn, openings, trainers, progress
content/            lessons, opening repertoires and the character profiles
docs/characters/    the character bible, personality engine spec, V5 voice bible and integration guide, and how Tempo plays it
assets/, data/      Stockfish, fonts, puzzle and opening data
build/build.py      packs everything into one file
tests/              rules, engine and content checks
tools/push.sh       commit and push from a Claude session
tools/with_portraits.py  a copy of Tempo with pictures for the characters, for your own use; the published build keeps its badges
```

## Pushing from a Claude session

`tools/push.sh "message"` commits everything and pushes to `main`. It reads a fine-grained token (Contents: read and write, this repository only) from `.github-token`, which is git-ignored and must never be committed.

## Credits

- Stockfish 19 by the Stockfish developers, compiled to WebAssembly as [stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg (the lite single-threaded build is packed into the file; `tools/pack_engine.py`). GPL-3.0; source at [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish). On mrshaffer.org the page is cross-origin isolated and loads the site's multi-threaded lite build instead, and Preferences can download the full-strength build (94 MB) once per device, kept in Cache Storage.
- Puzzles from the [Lichess puzzle database](https://database.lichess.org/#puzzles) and opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), both CC0.
- DM Sans and DM Serif Display, SIL Open Font License 1.1.
- The chess pieces were drawn for this project.
