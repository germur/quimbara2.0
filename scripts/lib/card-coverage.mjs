import {fightKey, normalizeName, sameFighterName} from '../../src/lib/event-data.mjs';

const placeholders = new Set(['tba', 'tbd', 'opponenttba', 'opponenttbd', 'porconfirmar']);
const isNamed = name => Boolean(normalizeName(name)) && !placeholders.has(normalizeName(name));

export function namedBouts(card = []) {
  return card.filter(bout => isNamed(bout.f1) && isNamed(bout.f2) &&
    normalizeName(bout.f1) !== normalizeName(bout.f2));
}

export function sameBout(a, b) {
  return (sameFighterName(a.f1, b.f1) && sameFighterName(a.f2, b.f2)) ||
    (sameFighterName(a.f1, b.f2) && sameFighterName(a.f2, b.f1));
}

// ESPN supplements the calendar. A small subset can corroborate a freshly
// checked Wikipedia card without replacing it or claiming a successful ESPN refresh.
export function cardCoverage(event, incoming, now = Date.now()) {
  const existing = namedBouts(event.fightCard);
  const received = namedBouts(incoming);
  if (!received.some(bout => sameBout(bout, event))) return 'reject';
  if (received.length >= existing.length / 2) return 'replace';

  const checked = Date.parse(event.cardCheckedAt);
  const freshWiki = event.cardSource === 'Wikipedia' &&
    /^https:\/\/en\.wikipedia\.org\/wiki\//.test(event.cardSourcePage ?? '') &&
    checked <= now && now - checked < 6 * 60 * 60 * 1000 &&
    existing.some(bout => sameBout(bout, event)) &&
    new Set(existing.map(fightKey)).size === existing.length;

  return freshWiki && received.every(bout => existing.some(saved => sameBout(bout, saved)))
    ? 'keep-wikipedia' : 'reject';
}
