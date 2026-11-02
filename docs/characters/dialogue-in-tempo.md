# How Tempo plays the V5 dialogue

The words are the Character Voice V5 pack (`voice-bible.md`, `dialogue-integration-guide.md`), merged into
`content/characters.json` as written. This note says how Tempo decides when to say them. `src/talk.js` picks the line;
`src/ui/play.js` shows it; `tests/talk_test.js` and `build/talk_test.py` check it.

## The referee

Every claim about the chess needs evidence. Besides the board itself, the evidence is a quick, separate analysis of
each position (Stockfish at depth 9 for 300 ms where it runs, else Tempo's own engine), scored from the character's
side. Two scores are compared only when the same engine produced both. Without the referee (a browser that blocks
workers), the character still greets you, reacts to captures and checks, makes quiet remarks and has its say on the
result; everything that needs the referee is simply not said.

## One remark per move

After your move (before it answers), the candidates are: its hello if it's still waiting (Gru), your check, a
special of yours, your blunder, a story beat. After its move: its hello if still waiting, its check, its special,
its blunder, a story beat, its capture, a quiet move. The first one that may be said is said.

- A check either way, a capture and a quiet move are ordinary: said only on a roll of the character's
  `baseline_line_chance`, one roll per move.
- Specials, blunders and beats need no roll; their evidence is the gate.
- After any line, including the hello, the character is quiet for `cooldown_full_moves` full moves (twice that in
  plies). Results are never held back.
- Frequent: the chance times 1.5 (at most 0.9) and one full move less of cooldown (at least one).
- A line is said once a game. The cries of Psyduck and Pikachu may sound alike; that's in the pack.
- One exception to the pack's order: when a story beat and the special both come true on the same move, the beat goes
  first, because a story can't skip a beat (Sheldon's special and his first beat are the same moment; so are the
  sacrifice specials and the first beat of a sacrifice story).
- A remark about your move is shown before the reply, and the reply waits a moment for it. A line that waited and
  finds the board has moved on is dropped, and only lines really shown go into the game's story.
- A tap on the line, or Escape, puts it away. One line at a time.
- A blunder is a swing of 200 or more on the referee (not between two decided positions).
- Draws have no line; the pack has none. There is no line for a long think either.

## Story beats

Beats play in order, at least four plies apart. The gate names are the pack's; this is what each one checks.

| Gate | True when |
|---|---|
| first_own_pawn_move | its pawn makes its first move (on that move) |
| own_pawns_advanced_at_least_3 | it moves a pawn, and three or more of its pawns have moved |
| own_pawn_promoted | its pawn became a queen in the last four plies, and she's still there |
| first_own_knight_move | it moves a knight (the story follows that knight) |
| own_knight_moves_at_least_3 | that knight makes its third move or more |
| own_knight_captured | you took that knight, in the last eight plies |
| verified_knight_fork | its knight forks, and the referee says it wins |
| first_own_queen_move / own_queen_moves_at_least_4 / own_queen_captured | the same, for its queen (fourth move) |
| first_own_rook_move | it moves a rook (castling doesn't count) |
| own_rooks_connected | after its move, two of its rooks see each other along a rank or file |
| own_rook_on_seventh | it moves a rook to your second rank |
| first_own_minor_piece_developed | it develops a knight or bishop from the back rank |
| own_minor_pieces_developed_at_least_3 | it moves a minor piece, and three of them have moved |
| verified_tactic, own_combination_tactic_verified | its move makes a fork, pin, skewer, discovered attack, removes a defender or traps a piece, and the referee says it's worth 150 more than the material shows, at no cost |
| first_own_king_checked | you check it |
| own_king_checked_at_least_2 | you check it, for the second time or more |
| own_king_escaped_check_sequence | six plies with no check since the last one (and since beat 2), on its move |
| opponent_king_checked_at_least_2 | it checks you, for the second time or more |
| first_opponent_capture / opponent_captures_at_least_3 | you've taken one (three) of its pieces, the last in the past six plies; "exactly" for Velma and Judy ("First piece missing", "Three disappearances") |
| first_opponent_piece_captured / opponent_pieces_captured_at_least_3 | the same for what it took; exactly one for Wednesday's "First obituary" |
| opponent_queen_captured | it took your queen, in the last eight plies |
| game_reaches_move_10 / 20 / 30 | 18 / 38 / 58 plies played |
| first_own_piece_threatened | your move leaves a piece of its (a knight or more) hanging |
| own_piece_captured | you took one of its pieces (not a pawn), in the last six plies |
| first_opponent_threat_verified | your move leaves a piece of its hanging, or threatens mate |
| same_threat_neutralized | its move answers such a threat: nothing hangs, no mate, and the referee agrees |
| verified_counterattack | its move threatens a piece of yours, checks or threatens mate, at no cost, and it's not worse |
| opponent_deviates_from_book | you left Tempo's opening book, in the last four plies (within the first 30) |
| off_book_move_holds_eval | 4 to 16 plies later, the referee has you no more than 60 behind |
| non_book_win_or_loss | a decisive result after beat 2: shown on the end sheet after the result line (Sheldon) |
| first_own_file_control | it puts a rook or queen on a file with no pawns and none of your rooks or queens |
| opponent_mobility_reduced | your legal moves are down to 70% or less of ten plies ago (25 at most), with none of your pieces lost |
| verified_forcing_sequence | the referee sees mate for it, or its last three moves were checks or captures and it's 300 ahead |
| first_own_piece_sacrifice_verified | it leaves a piece (or a pawn) to be taken and the referee says it costs nothing; a pawn for the Joker |
| sacrifice_line_still_sound | you took it, and four plies on the referee still likes its position (within 60) |
| compensation_realized | its material is back where it was before the sacrifice, and it's not worse |

## Specials

A special is said only when every guard holds. The pack's guards, and Tempo's for the 27 specials the pack left
without any (`special_guards`), check:

- verified_tactic, verified_knight_fork, verified_knight_tactic, verified_quiet_tactic, verified_capture_tactic: a
  tactic as above (by a knight; without a capture or check; with a capture, for the Crewmate's "two pieces were
  there. now one").
- verified_sacrifice: its sacrifice, the referee saying it costs at most 60.
- verified_escape (and _or_tactic, _from_knight): it was in check with three moves or fewer, or had a piece hanging
  (from a knight); after its move nothing of its hangs, there's no mate, and it lost at most 30.
- verified_pawn_break: its pawn strikes at your pawns, at no cost. verified_recovery: 150 behind within six plies,
  level now.
- multi_piece_coordination: two of its pieces, one of them the piece it moved, hit one of yours, and it pays 100.
- strong_coordinated_attack: three or more of its pieces hit the squares around your king, and it's 150 ahead.
- verified_opponent_weakness: its move goes after a piece of yours that can be taken, and it pays 100.
- verified_branch_choice: Stockfish's best move by 100 or more, and it found it (Stockfish characters only).
- verified_restriction: your legal moves cut by a third or more (six at least) since your last turn, and it's 50 ahead.
- After your move: verified_trap (you took something that looked free, and it cost you 200), verified_decoy (150),
  opponent_bishop_recently_moved, opponent_deviated_from_opening, opponent_verified_tactic (your tactic, worth 150
  to you), verified_eval_difference (you captured or checked, and it cost you 100), verified_opponent_sacrifice
  (Olaf's line is about your sacrifice, so Tempo uses this one for him).

## Lines that describe the board

`dialogue_requires` holds what a line says about the move: Olaf's and SpongeBob's quiet lines need a pawn move,
the Crewmate's needs e4, Ralph's "blue square" a dark square, Wednesday's "Silence" a quiet move of yours; "free
stuff" and "left that loose" need a piece nobody guarded; "the exchange" a trade or recapture; Sherlock's "that
defender" a capture that leaves another piece hanging; Batman's "That threat is gone" a piece that was attacking;
Sheldon's "Material advantage" being ahead; blunder lines about a piece left hanging need one; Ralph's "tower" a
rook's check; Eggman's "diagonals" a diagonal check. Gru's hello ("oh. A pawn moved already.") waits for a pawn to
move, within the first two moves each.
