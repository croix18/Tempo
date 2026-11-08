// Builds the trap lessons from the traps in content/openings.js, so a trap's line and notes live in one place.
// Each lesson: watch it, set it (guided), dodge it as the other side, then set it again from memory.
// A trap marked noSet (Scholar’s Mate) teaches the defense: watch it, play the defense with arrows, dodge it, then
// play the defense from memory.
const traps = require('../openings.js').traps || [];
function lesson(id) {
  const t = traps.find(x => x.id === id);
  if (!t) { console.error('trap-lessons: no trap ' + id); return null; }
  const steps = [{ t: 'walk', trap: id }];
  if (t.noSet) steps.push({ t: 'line', trap: id, role: 'defend', guide: true }, { t: 'safe', trap: id }, { t: 'line', trap: id, role: 'defend', guide: false });
  else steps.push({ t: 'line', trap: id, role: 'set', guide: true }, { t: 'safe', trap: id }, { t: 'line', trap: id, role: 'set', guide: false });
  return { id: 'trap-' + id, title: t.name, summary: t.summary, trap: id, steps };
}
function unit(u) { return { id: u.id, title: u.title, summary: u.summary, lessons: u.traps.map(lesson).filter(Boolean) }; }
module.exports = { lesson, unit };
