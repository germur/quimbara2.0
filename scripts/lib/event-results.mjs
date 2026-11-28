import { canonicalEvents, eventIdentity } from '../../src/lib/event-routing.mjs';
import { expandAnnouncedNames, sameFighterName, validDate } from '../../src/lib/event-data.mjs';

function samePair(first, second) {
  return (sameFighterName(first.w, second.w) && sameFighterName(first.l, second.l)) ||
    (sameFighterName(first.w, second.l) && sameFighterName(first.l, second.w));
}

export function archiveEventResults(archive, events, date, results) {
  if (!validDate(date) || !results.length) return null;
  const matches = canonicalEvents(events).filter(event => {
    if (event.date !== date || !event.main || event.main === 'TBD') return false;
    const { f1, f2 } = expandAnnouncedNames(event);
    return samePair(results[0], { w: f1, l: f2 });
  });
  if (matches.length !== 1) return null;

  const eventId = eventIdentity(matches[0].slug);
  const previous = archive.find(entry => entry.eventId === eventId && entry.date === date);
  // A source may briefly expose only part of a card. Keep the earlier fights,
  // and preserve results already verified against the official UFC scorecards.
  const official = previous?.results.filter(result => result.sourceUrl.startsWith('https://www.ufc.com/')) ?? [];
  const merged = [...results.map(result => official.find(saved => samePair(saved, result)) ?? result)];
  for (const saved of previous?.results ?? []) {
    if (!merged.some(result => samePair(result, saved))) merged.push(saved);
  }
  return [
    ...archive.filter(entry => entry !== previous),
    { eventId, date, results: merged },
  ].sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));
}
