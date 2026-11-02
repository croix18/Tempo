# Tempo Chess — Deep Character Dialogue V3: Claude integration guide

## What is included

- **61 complete character personalities** with the previous tier, ratings, bio, and move-selection metadata preserved.
- **915 individually authored chess-event remarks** (15 per character), plus **183 ordered running-joke beats** (three per character).
- A standalone **character-card gallery** with offline search, tier filters, context-labelled dialogue previews, and running story previews.
- Both **full JSON** (for merging into the existing chess profiles) and **compact JSON** (for loading character-copy data only).

**All speech is original creative fan-game writing, not official character dialogue.** Canon background facts, character interpretation, and invented ratings must be displayed separately.

## DO NOT treat the pack as a completed integration

This update does not patch the 1.6 MB `Tempo Chess.html` chess application. It supplies production-ready content and the event contract, with a working standalone character-card preview. Implement the new renderer and engine hooks against Tempo's existing game state and engine. No chess rules, ratings, save files, or puzzle data should be changed solely to add dialogue.

## 1. Integrate data without destroying bot configurations

`Tempo_Chess_Character_Voice_V3.json` retains each established character's chess fields (`id`, `tier`, `tempo_elo`, `archetype`, `openings`, `tactical_preferences`, `strategic_plan`, `exploitable_weakness`, `behavior_traits_0_to_100`) plus the new voice fields.

If the new character roster is not yet integrated into Tempo, import its chess profiles first. Match by immutable `id` rather than display name. For an existing roster, merge only these new fields: `character_interpretation`, `running_bit_description`, `dialogue`, `dialogue_arcs`, and `dialogue_style`. `prior_dialogue_v2` is an archive, not text to play.

The standalone preview is demonstration UI; its button clicks simulate events. It is not a chessboard or an engine adapter.

## 2. Card view layout

Use a clickable card with portrait, name, tier, rough Tempo Elo, and one-sentence subtitle. Open a card detail panel with:

1. **Who they are** (`canon_background`) — factual, stable background from source fiction.
2. **Tempo's assessment** (`tempo_assessment`) — cheeky narrator commentary, distinct from canon.
3. **Why they play this way** (`character_interpretation` + `on_board_personality`) — the app's fictional chess interpretation.
4. **Voice and dialogue samples** — a few lines from the appropriate context; do not show every line on the front of the card.
5. **Running bit** — show its premise in the profile but let the three beats unfold in order during actual play.
6. Optional personal W/D/L record, favorite opening, tactical archetype from the pre-existing profile.

## 3. Exact event contract

Only emit an event **after** a legal game-state transition has committed, with the same gameId and ply still active:

| Event | When it can be said |
|---|---|
| `greeting` | New match, once |
| `quiet_move` | Bot's non-check, non-capture, non-terminal and non-special move |
| `capture_pawn` | Bot captured an **opposing pawn** |
| `capture_major` | Bot captured an **opposing rook or queen** |
| `opponent_blunder` | Human's move was assessed as a genuine blunder; require reliable enough engine analysis |
| `own_blunder` | Bot's move was assessed as a genuine blunder |
| `check` | Bot has just checked the human king |
| `in_check` | Human has just checked the bot's king |
| `tactical_success` | Detector confirms a meaningful fork/pin/discovered attack/sound sacrifice etc. **Not** mere check or capture |
| `queen_lost` | Human just captured **bot's queen** |
| `player_thinking` | Human takes a long time and a once-per-game guard has not fired |
| `victory`, `defeat`, `draw` | Actual terminal result, from the bot's perspective |
| `rematch` | User actually starts another match against that character |

A capture and a check can occur on the same move; show at most one line, using result > check > queen loss > confirmed tactic > major capture > pawn capture > other. For `queen_lost`, the speaker is the character whose queen is captured, even though the human moved.

Do not describe a **fork**, a **sacrifice**, or a **blunder** unless your chess analysis supports it. For lower-tier bots with weak analyses, skip `opponent_blunder`, `own_blunder`, and `tactical_success` rather than invent claims. Always detect terminal conditions **before** ordinary events. Never let dialogue interrupt chess clocks or engine computation.

## 4. Implement ordered story bits

Each profile has a `dialogue_arcs[0]`:

```
{
  id, theme, ordered: true,
  beats: [
    {index:1, trigger_hint:"...", line:"..."},
    {index:2, trigger_hint:"...", line:"..."},
    {index:3, trigger_hint:"...", line:"..."}
  ]
}
```

Treat `trigger_hint` as a **design requirement**, not an already implemented callback. Never emit a beat without verifying its trigger in the current game; never emit beat 2 without beat 1, nor beat 3 without beat 2. If the required event never happens, that arc may remain unfinished. That is better than a nonsensical joke.

For the initial integration, build detectors for universal hints (`early_game`, `middlegame`, `late_game`, `opening_after_move_3`, `piece_captured`, `bot_pawn_captured`) and one dedicated flagship arc: Patrick's queen **moves, moves again, then is captured**. Suppress unsupported hints rather than reducing them to arbitrary move counts. A later version can implement advanced hints such as `human_pawn_sacrificed`, `verified_sound_nonbook_move`, and `rook_endgame`.

A second arc beat must also be separated from the previous beat by at least four plies. Per match: store `arcBeatIndex`, `arcLastPly`, `usedEvents`, and `playerThinkingFired`, keyed to `gameId` + `botId`. Reset them on a new match. Preserve them if the same game is resumed; restore/recompute after an undo without misattributing a future remark to a prior state.

## 5. Dialogue frequency should be personal

- Default **Occasional**: regular line candidate ≈20% chance, at least four full moves apart (for F/D you may use 30% and three full moves, already encoded in `dialogue_style`).
- **Sparse** characters (Batman, Wednesday, Spock, Darth Vader, Beth, etc.) should speak less frequently. `dialogue_style` has an individual base probability.
- **Frequent** mode may increase ordinary probability by 1.5×, capped at 0.55, and shorten cooldown by one full move.
- **Off** disables everything, including results if desired. Keep game stats and actions visible independently.
- Never repeat an identical line within a game. A character has only one core line per event in this revision, so after an event fires once, suppress it or substitute an eligible previously-unused story beat; **do not** loop the same joke every capture.
- `greeting`, result, and rare signature beats can bypass the ordinary cadence when their guards are true, but do not issue two separate bubbles on the same committed ply.
- Screen-reader presentation: use a `role=status` / polite live region for sparing messages; never fire repeated announcements over a ticking clock.

## 6. Recommended priority and safeguards

Pseudo-code, not drop-in JavaScript:

```js
async function maybeReact(game, before, move, after, character, snapshot) {
  if (settings.dialogue === 'off') return;
  // Evaluate only safe, verified facts first.
  const fact = classifyCommittedMove(before, move, after, game.botColor);
  // Optional asynchronous engine analysis can refine this, but must check gameId/ply.
  const event = chooseHighestPriorityEligibleEvent(fact, game, character);
  if (!event) return;
  const line = character.dialogue[event];
  if (!line || alreadyUsed(game, character.id, event, line)) return;
  if (!passesCadenceOrIsCritical(event, character.dialogue_style, game)) return;
  if (snapshot.gameId !== game.id || snapshot.ply !== game.ply) return;
  markUsed(game, character.id, event, line);
  showCharacterBubble(character.id, line, {polite: true, dismissible: true});
}
```

A story beat should be added to the same one-remark selection mechanism. It is not an extra message. Remember that engine eval scores are relative to side-to-move and can use mate scores; don't mistake a sign reversal for a blunder. Don't call an unprotected pawn a 'fork'.

## 7. QA checklist before going live

- All **61 immutable IDs** map to exactly one bot; display names can vary.
- Spot check Patrick's three-beat queen story with a scripted legal game sequence; verify it does not fire if the queen never moves or is never captured.
- Spot check Freddy's stage directions, Steve's silent actions, and Pikachu/Psyduck's non-English vocalizations.
- Verify own queen loss versus enemy queen capture, check/capture combo, mate/capture combo, sacrifices, promotions, resignations, stalemates, threefold repetition, and clock outcomes.
- Verify Off/Occasional/Frequent, mid-game reload, undo, rematch, game switching, and stale engine responses.
- Confirm the speech bubble is not positioned on top of the chessboard on a phone.
- Separate fiction canon from invented abilities and ratings on every public-facing card (even in a private app).

## 8. Selected factual reference points

These are reference links for a few potentially surprising or niche facts (not citations for the *invented* chess dialogue):

- [Netflix Tudum — Rumi](https://www.netflix.com/tudum/articles/kpop-demon-hunters-rumi-bio)
- [Netflix Tudum — Derpy Tiger](https://www.netflix.com/tudum/articles/kpop-demon-hunters-derpy-tiger-bio)
- [The Simpsons, “The Cad and the Hat”](https://tv.apple.com/us/episode/the-cad-and-the-hat/umc.cmc.cytaagjns1lrfstqkts1jcjr)
- [Harry Potter — Ron Weasley](https://www.harrypotter.com/fact-file/characters-and-pets/ron-weasley)
