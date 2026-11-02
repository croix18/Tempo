# Tempo Chess V5 — Integration and Editorial Guide

## Purpose and status

**V5 is original, character-first dialogue for 61 existing opponents. It is not yet wired into Tempo Chess.** Replace V4 dialogue; don't concatenate V3/V4/V5 pools. Preserve the existing game engine, opponent strengths, records, saved progress and chess rules.

The background bios, ratings and Tempo assessments have been carried over from V4. The **voice psychology, boundaries, and all active V5 event lines and arcs have been revised**. Canon-grounded traits come from fictional stories; assigning those traits to chess is an imaginative, non-canonical extrapolation.

## Voice requirements

1. A character's voice is not a catchphrase. Compare lines against `voice.core_psychology` and `voice.never_do` before displaying them. This is your quality bar.
2. Communication mode is a contract:
   - `silent`: no speech bubble, no stage-direction text or narration. Applies to **Peely, Steve (Minecraft), Derpy Tiger**. Optional facial-expression/portrait animations are a *different UI layer*, never dialogue.
   - `name_only`: applies to **Psyduck and Pikachu**. Only the authored vocalizations; no English translations, no brackets, no action captions. These are fixed words with distinct intonation, not free-form generation.
   - `minionese`: **Bob**, short Minionese-like exclamations, not fluent tactical English.
   - `in_game_text`: **Roblox Noob and Among Us Crewmate**, presented as short chat logs rather than spoken utterances. These are generic avatar archetypes; don't claim individual canonical biographies.
   - `speaker_pa`: **Classic Freddy Fazbear** uses restrained announcement-like text. Don't replace him with Glamrock Freddy's friendly parental voice.
   - `telepathic`: **Mewtwo** can communicate in articulate thoughts; avoid psychic assistance in a fair chess match.
   - `spoken`: all other dialogue.
3. Display text as written; do not add “Patrick says,” a narrator's paraphrase, sound descriptions, animations embedded as words, or unverified chess explanations.
4. **Rivalry and personality are separate from engine skill.** Dialogue never influences a move calculation, and no character receives a magical chess advantage.

## Event bindings in Tempo Chess

The uploaded HTML uses `TempoBots.BOTS`, `Engines.botMove()`, and `botSays(text)` inside the game view. V5 `id` values follow the established 61-profile roster. The **existing `botSays()` is a renderer**, not an event validator. Introduce a separate event interpreter and scheduler between the completed chess move and that renderer.

Use these source events:

| Event | Require actual state |
|---|---|
| `greeting` | Game genuinely started |
| `quiet_move` | Bot legally moves without capturing, checking, or triggering a higher priority event |
| `capture` | Bot legally captures; generic line must not identify a specific captured type |
| `check` | Bot's completed legal move leaves opponent king in check |
| `in_check` | Player's completed legal move checks the bot king |
| `opponent_blunder` | Stable post-move engine evaluation shows a significant avoidable error; not merely an unfamiliar move |
| `own_blunder` | Stable post-move engine evaluation shows bot error (optional; skip if unavailable) |
| `victory`, `defeat` | Confirmed final result from bot perspective |
| `rematch` | Explicit new game against same opponent |
| `special` | All predicates in `line_guards.special` satisfied; **never** present as fallback |

Don't let a `capture` line falsely say a rook was taken, an arc claim a queen was lost while she's on the board, or a mate line announce forced mate unless the search establishes it. A verification failure should produce **silence**, not an approximate substitute. Post-move blunder analysis may be too expensive on a mobile browser; disable such remarks rather than stalling the UI.

### Voice scheduler

Use a *single* weighted scheduler per completed legal move. Event priority: final game > check > verified tactic/special > verified blunder > eligible story beat > capture > quiet move.

- `voice.baseline_line_chance` defines the probability that an eligible ordinary event is displayed; nonterminal lines are optional.
- `voice.cooldown_full_moves` suppresses nonterminal chatter for the specified number of full moves. Do not suppress game results.
- At most **one nonterminal remark per move**, including story beats. No repeated line in the same game; rare exceptions only if explicitly authored (Pikachu/name cries).
- A game with a silent character should remain entirely silent. Never fill the empty bubble with instructions such as `[looks worried]`.
- In case of multiple legitimate remarks, choose the highest-priority eligible one and defer or discard others. Don't queue stale remarks that describe a different board position.
- Offer `Off`, `Occasional` (default), `Frequent` settings; Off means no utterance at all.

### Running arcs

Each `story_arc` has three ordered `beat`s and a `gate`. A `gate` is an **implementation request**, not an available built-in API. Each gate must have a tested detector before its beat can play. `requires_prior_beat` enforces order; if beat 2 cannot occur because a queen dies early, **never jump to beat 3** or fabricate beat 2.

Track:
- `seen_line_ids` and `seen_arc_beats` (per character per game)
- `last_utterance_full_move`, pending bubble timeout, dialogue setting
- relevant per-game counters, piece identities, confirmed tactics, captured piece types, and opening-book deviation state

**43 arc gate types are requested in the pack**. They are NOT 43 pre-existing features. Implement a minimal subset first (`game_reaches_move_N`, piece move counters, capture identity, `verified_knight_fork`). Keep others disabled until tested.

### Suggested architecture pseudocode

```js
const p = characterProfiles[activeBot.id];
if (!p || p.voice.mode === 'silent' || chatSetting === 'off') return;

const facts = deriveVerifiedMoveFacts(previousPosition, legalMove, currentPosition, gameResult);
const candidates = eligibleDialogueEvents(facts, p, characterDialogueState);
const chosen = chooseOneCandidate(candidates, p.voice, characterDialogueState);
if (!chosen) return;

// Emit only AFTER animation / move resolution, if game and position are unchanged.
renderCharacterText({text: chosen.text, mode: p.voice.mode, character: p.name});
recordSeen(chosen, characterDialogueState);
```

Do not let ineligible `special` lines compete with generic events. Note that `in_check` reflects the player's move, while `check` reflects the character's move.

## Regression tests (mandatory before deployment)

1. All 61 IDs match previous character roster exactly; source JSON parses; no extra duplicate event IDs.
2. Psyduck only says variants of 'Psyduck'; Pikachu only name syllables, without action text. Peely, Derpy, Steve show zero text bubbles.
3. A bot cannot announce a capture, check, queen loss, promoted pawn, fork, sacrifice, or blunder that was not actually verified.
4. A promotional capture or en passant is analyzed correctly as a capture; choose terminal result over normal capture lines.
5. Arc beat 3 never plays without beats 1 and 2. Character rematch resets in-game arc and seen-line state.
6. Quiet-position testing: Batman/Vader/Beth speak much less often than Patrick/Donkey/SpongeBob.
7. Enabling or disabling dialogue never changes legal moves, bot Elo parameters, analysis score, or saved game data.
8. No repeated ordinary spoken remark within a single game, unless a cry-only species intentionally repeats their name.
9. All bubbles remain readable at phone widths; long remarks can be dismissed, and only one is shown at a time.
10. Mobile with Stockfish blocked: basic captures/checks/terminal dialogue still work; engine-only assessments and specials fail silently.

## Editorial decisions needing owner review

- **Homer** is treated as a canon chess savant (episode *The Cad and the Hat*); his references to his father and early chess memories are intentional rather than a random prodigy joke.
- **Ron** is a genuinely capable chess player. Avoid lines in which Hermione explains chess to him or rescues his basic strategy.
- **Dory** should be empathetic and resourceful, not mocked for disability.
- **Mewtwo** communicates telepathically, unlike Pikachu/Psyduck.
- **Wednesday** is based primarily on the Netflix portrayal (including teenage insecurity beneath her composure), not solely older Addams Family versions.
- **Classic Freddy Fazbear** is intentionally distinguished from Glamrock Freddy.
- **Roblox Noob and Among Us Crewmate** represent game archetypes; their chat is an original, game-inspired persona, not source-canon character dialogue.

## Canon research notes

Selected external confirmations used in this editorial pass (the dialogue itself is newly written):
- Ron's chess confidence and meaningful self-sacrifice: https://www.harrypotter.com/features/how-ron-weasleys-wizard-chess-match-showed-his-true-potential
- Dory's resourcefulness and search for her family: https://www.pixar.com/finding-dory
- Netflix's description of Rumi and her internal conflict: https://www.netflix.com/tudum/articles/kpop-demon-hunters-rumi-bio
- Netflix's nonverbal Derpy Tiger: https://www.netflix.com/tudum/articles/kpop-demon-hunters-derpy-tiger-bio
- Homer as a chess savant in *The Cad and the Hat*: https://simpsonswiki.com/wiki/The_Cad_and_the_Hat

This is a **writing and integration specification**, not a claim that all 61 canonicities have been exhaustively fact-checked against every show, game, film, season, or adaptation.
