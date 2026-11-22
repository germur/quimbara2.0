import {canonicalEvents,eventPath} from './event-routing.mjs';
import {expandAnnouncedNames,fightKey,validDate} from './event-data.mjs';
import {resolvePerson} from './fighter-media.mjs';

export function indexFighterEvents(events, fighters) {
  const byFighter = new Map();
  for (const event of canonicalEvents(events).reverse()) {
    if (!validDate(event.date) || !event.main || event.main === 'TBD' ||
        ['unconfirmed', 'cancelled', 'postponed'].includes(event.status)) continue;

    const main = expandAnnouncedNames(event);
    const card = event.fightCard ?? [];
    const bouts = card.filter(bout =>
      !['cancelled', 'postponed', 'withdrawn'].includes(bout.status) &&
      !['STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_POSTPONED'].includes(bout.sourceStatus)
    );
    if (!card.some(bout => fightKey(bout) === fightKey(main))) bouts.push(main);
    const fightersSeen = new Set();
    for (const bout of bouts) {
      const first = resolvePerson(bout.f1, fighters);
      const second = resolvePerson(bout.f2, fighters);
      if (!first || !second || first.slug === second.slug) continue;
      for (const [fighter, opponent] of [[first, second], [second, first]]) {
        if (fightersSeen.has(fighter.slug)) continue;
        fightersSeen.add(fighter.slug);
        const entries = byFighter.get(fighter.slug) ?? [];
        entries.push({
          date: event.date,
          dateLabel: event.dateLabel,
          name: event.name,
          opponent: opponent.name,
          href: eventPath(event.slug),
        });
        byFighter.set(fighter.slug, entries);
      }
    }
  }
  return byFighter;
}
