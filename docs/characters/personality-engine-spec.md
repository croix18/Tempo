# Tempo Chess — Character Personality Engine: Implementation Specification

Date: 2026-10-31. This is an engineering handoff, **not a claim of implemented functionality**. Applies to the user's current `Tempo Chess.html`.

## Findings in current Tempo HTML

- `TempoBots.BOTS` defines 14 existing bot records with `rating`, `cfg`, and dialogue.
- `TempoEngine.botMove` currently uses `cfg.depth`, `qs`, `temp`, `random`, `blunder`, `inaccuracy`, and `style`.
- Existing `styleBonus()` only considers capture, check, central-square, development, castling, early queen, and king-walk signals. It does not know whether a move is a fork, pin, skewer, discovered attack, or credible sacrifice.
- `Engines.sfNext()` already sets Stockfish UCI `Skill Level` and `MultiPV`; `Engines.sfLine()` captures several `multipv` lines; `Engines.analyse({multipv:...})` already supports multi-line analysis.
- `Engines.botMove()` currently requests `multipv:1` for Stockfish bots, and returns the top move directly. Personality-based Stockfish move selection should be added here, not reimplement the chess rules or bypass legal-move validation.
- When Stockfish isn't available, Tempo's fallback `tempoAnalyse` can return candidate moves (`scoremoves`), but its current multi-line fallback uses a fixed maximum shallow depth. Define explicit fallback personality degradation and warning-free gameplay.
- Current `bookMove()` matches stored SAN snippets. This is not yet a robust repertoire system for 61 named characters.

## Product model

Each character has **two independent contracts**:

1. `strength`: tier / target internal rating / engine backend / search budget / error distribution. Measure and calibrate with matches. Never equate a UCI setting with a known Chess.com Elo.
2. `personality`: preferred structures, tactical motifs, initiative, risk, defense, exchanges, and opening repertoire. Style must influence choice **only among objectively permitted candidates** unless the chosen strength explicitly allows blunders.

The `Tempo_Chess_Character_Profiles.json` file is the editable content source for all 60 tiered characters and the bonus Joker.

## Candidate selection — recommended algorithm

1. Confirm whose turn it is, game state, available backend, and legal moves via the authoritative chess core. Return forced legal move without a selection contest.
2. During opening book stage, choose among **legal position-matched** book options weighted by that character's repertoire. The book should not force a move after a deviation.
3. For Stockfish profiles, ask for `MultiPV = 5` or `8` with a fixed time budget and **Skill Level = 20** during the analysis pass to get strong comparable candidate assessments. Do not mix skill-perturbed scores with the objective candidate evaluation. At higher tiers, use a smaller allowed score loss, e.g. 5–20 centipawns; for B/C, a larger value; for F/D, use custom Tempo low-depth engine with a broader legal move pool rather than treating MultiPV 5 as an adequate source of blunders.
4. Safely interpret Stockfish `score cp` and `score mate` including side-to-move sign, bound flags, depth, and complete MultiPV iterations. Store each candidate with a normalized **bot-perspective** score. Mate wins/losses must be treated separately from ordinary centipawn losses.
5. For each move, compute position-dependent features: move/capture/check, king exposure, center control, development, piece activity, exchange, early queen activity, pawn structure, castling, tempo, tactical motif labels (see below), and tactical soundness/compensation.
6. Apply strength-dependent eligibility filter BEFORE personality preferences. Protect forced mates, prevent silly stalemates by strong bots, and prefer a forced win where visible to the chosen skill tier. Distinguish deliberate beginner errors from personality bias.
7. For the remaining moves: `utility = calibrated_engine_score + weighted_features(character,phase) + bounded_seeded_noise`; sample via a softmax temperature configured by strength. Avoid treating the 0–100 UI trait values as direct centipawn bonuses. Cap each style preference so it cannot override a crushing tactical disadvantage at A/S.
8. Revalidate selected UCI move as legal just before applying it. Generate dialogue based on **verified events**, not unconfirmed claims of tactical brilliance.
9. Log `botId`, `positionHash`, `engine`, `candidateMoves`, `evaluations`, `features`, `styleContribution`, `selectionReason`, `seed`, `chosenMove`, latency. This is essential for debugging and strength calibration.

### Recognize genuine tactics

**Don't conflate checks with tactics.** A check can be useless and a quiet move can create a tactic. Derive motifs using legal moves and at least a short validated variation:

- **Fork:** after candidate, one friendly piece attacks two or more valuable enemy pieces; filter for cases where the attacker can actually win material.
- **Pin:** a line piece immobilizes or constrains another piece because moving it exposes a king/valuable piece.
- **Skewer:** a line piece attacks a high-value enemy piece with a second target behind it.
- **Discovered attack:** moving a blocker reveals a line attack; include discovered check separately.
- **Deflection:** the move forces a defender away from a critical square or piece.
- **Removal of defender:** the move captures or dislodges an enemy piece that was guarding something valuable.
- **Zwischenzug:** a useful forcing move inserted before the obvious recapture / expected continuation.
- **Back-rank:** checkmate threats against a king trapped by its own pawns.
- **Sound sacrifice:** current material balance declines, but engine/variation verifies adequate compensation; avoid declaring a sacrifice sound based solely on `isCapture` or `check`.
- **Zugzwang:** not just any quiet move. Verify the opponent has only worsening legal replies; expensive, so limit to endgame analysis or a dedicated detector.

Motifs can be tagged on the moves in candidate PV lines. For a performance-friendly first version, start with checks/captures, fork, hanging pieces, castling, pawn breaks, and trades. Add stronger verified tactical detections incrementally.

## Suggested backend division

| Tier | Recommended engine strategy | Personality implementation |
|---|---|---|
| F, D | Existing Tempo engine with broadened legal candidate scoring and deliberate, strength-calibrated oversights | Large biases, predictable mistakes, occasional surprise shot, strong dialogue |
| C, B | Tempo engine or Stockfish MultiPV if performance permits | Preferred tactics and openings, bounded reasonable deviations, authentic flawed tendencies |
| A | Stockfish MultiPV; search deeper and limit centipawn concession | Primarily sound stylistic choices and specialized opening repertoire |
| S | Stockfish strong search; tight margin from best move | Personality mostly through opening selection, near-equal moves, pawn structures, and dialogue |

For extremely weak bots, do not rely only on Stockfish `Skill Level` or `UCI_Elo`: neither ensures *which sorts* of mistakes appear, and candidate-limited searches may never surface truly bad moves. Tempo's built-in shallow scorer is an existing asset.

### Pseudocode — illustrative, not drop-in code

```js
async function selectCharacterMove(game, character, engines, rng) {
  const legalMoves = chessCore.legalMoves(game);
  if (legalMoves.length === 1) return legalMoves[0];

  const bookMoves = repertoire.legalMatches(game, character.openings);
  if (bookMoves.length && shouldUseBook(character, game)) {
    return chooseBookMove(bookMoves, character, rng);
  }

  const options = await analyzeCandidates(engines, game, character.strength);
  const evaluated = normalizeCandidateScores(options, game.sideToMove);
  const eligible = filterByStrengthAndMateSafety(evaluated, character.strength);

  const scored = eligible.map(candidate => ({
    ...candidate,
    motifs: analyzeVerifiedMotifs(game, candidate.move, candidate.pv),
    personalityScore: evaluatePreferences(character, game, candidate),
  }));

  const move = seededSoftmaxPick(scored, character.strength.temperature, rng);
  if (!chessCore.isLegal(game, move)) throw new Error('Invalid bot move');
  return move;
}
```

## Concrete chess personality examples

- **Ron Weasley**: high tactical activity; opening repertoire prioritizes gambits. Prefer a sound sacrifice in exchange for development and open lines; never just throw away a rook because 'Ron likes sacrifices'.
- **Sheldon Cooper**: high opening preparation and lower risk tolerance; penalize unnecessary gambits and open king exposure. When outside repertoire, no cheating or artificial loss of legal knowledge: represent discomfort by constrained search or occasional conservative choice appropriate to target rating.
- **Steve**: favor protected pawn chains, stable outposts, coordinated defense; punish reckless pawn pushes that create holes.
- **Wednesday**: favor trapping tactics, overloaded defenders, and quiet threat accumulation; avoid unsafe 'poisoned pawn' selection unless the tactic is objectively viable for her rating.
- **Batman**: seek prophylactic moves that prevent the strongest threat; prefer robust king safety, good coordination, and counterattacks over flashy sacrifices.
- **Homer**: near-full-strength engine, unconstrained sound opening options, goofy speech, high-level precision, and a secret unlock; dialogue should never lower playing strength. Do not promise 3100 measurable rating without testing.

## Opening repertoire representation

Use positional lookup with FEN/Zobrist or a legal Polyglot-style book, not string matching on an English family label. For each supported position, store `uciMove` plus relative weight and optional tags. Distinguish White preference vs Black vs 1.e4 vs Black vs 1.d4. Avoid black-side mismatches (e.g. 'Sicilian' can only respond to 1.e4, but not to every move). At low tiers, use book for only 2–5 plies then let the low-strength bot drift; otherwise a 200-rated character could deliver 15 perfect opening moves.

## Performance and quality gates

- Separate UX work from engine work. Preserve the current playable build as a fallback.
- Cached analysis: key by FEN, side, engine version, MultiPV, depth/time configuration, and skill. Never reuse old results across incompatible settings.
- On mobile, cap CPU use; MultiPV 8 may be slower than a single PV. Prefer background workers where supported. If native workers fail, use the Tempo engine fallback, not a UI-freezing analysis loop.
- Test every character against the same benchmark opponents for at least 100+ games per pairing across both colors and multiple opening positions; more games for close tiers. Calibrate win rates (and optionally a Glicko/Elo scale) rather than trusting target ratings.
- Avoid bot-vs-bot loops that reinforce errors. Include easy tactical test positions, mate in one/two, obvious hanging pieces, bare-kings stalemate, promotions, and drawn endings.
- Never run `MultiPV` at maximum without monitoring battery, temperature, and response latency on Android tablets.
- Track style fingerprint: frequency of verified forks, sacs with compensation, trades when ahead, early queens, completed development, and chosen openings; verify different personalities actually yield distinguishable behavior.
- Implement quiet mode: character banter on/off independent of chess ability, adjustable frequency, age-appropriate and non-abusive for student sharing.
- Maintain a full regression suite for legal moves, undo, clocks, draw handling, saved progress, promotion, and analysis.

## Engineering sequence for Claude

1. Import profiles as data without changing active BOTS; add an internal character-select UI behind feature flag.
2. Add an adapter mapping `profile.strength` to existing Tempo engine config and first support F/D bots. Verify that current play remains unchanged.
3. Add `MultiPV` candidate reranking for high-tier Stockfish bots, with safe score normalization and mate logic.
4. Add the first reliable tactical motif features: forks, attacked loose pieces, exchanges, king safety, then discovered attacks and pins.
5. Add position-aware repertoire books and phases (opening, middlegame, endgame).
6. Add trigger-driven dialogue, records, rivalries, win/loss persistence, and championship unlocks.
7. Run automated multi-seed testing to calibrate tiers and personality fingerprints.

The personality JSON is a content/design document. This spec is a proposed implementation plan. **No original Tempo HTML file has been modified.**
