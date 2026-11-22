import {canonicalEvents, eventPath} from './event-routing.mjs';
import {fightKey, validDate, normalizeName} from './event-data.mjs';
import {resolveBoutPerson, sameMediaName} from './fighter-media.mjs';

export const CARD_MAX_AGE = 72 * 60 * 60 * 1000;
export const bogotaDate = now => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(now));

export function calendarUpcomingEvents(events, now = Date.now()) {
  const today = bogotaDate(now);
  return canonicalEvents(events).filter(event =>
    validDate(event.date) && event.date >= today && event.main && event.main !== 'TBD' &&
    !['unconfirmed', 'cancelled', 'postponed'].includes(event.status)
  );
}

// Public profile links must refer to the identified participant, never just a surname.
function participant(bout, side, people) {
  const name = bout[side];
  const id = bout[side + 'StatsId'] ?? bout[side + 'Id'];
  const identified = id ? people.filter(p => p.slug === id || p.ufcStatsId === id) : [];
  const person = identified.length === 1 && sameMediaName(identified[0].name, name)
    ? identified[0] : resolveBoutPerson(name, id, bout.weightClass, people);
  return {
    name: person?.name ?? name,
    nick: person?.nick ?? '',
    href: person ? `/peleadores/${person.slug}/` : null,
    photo: person?.img ?? '',
    record: person?.recScope === 'pro' ? person.rec : null,
  };
}

export function upcomingFights(events, people, {now = Date.now(), limit = 3} = {}) {
  const today = bogotaDate(now);
  for (const event of canonicalEvents(events)) {
    if (!validDate(event.date) || event.date < today ||
      Date.parse(event.date + 'T00:00:00-05:00') > now + 42 * 86400000 ||
      ['unconfirmed', 'cancelled', 'postponed'].includes(event.status)) continue;
    const checked = Date.parse(event.cardCheckedAt);
    if (event.cardFetchError || !Number.isFinite(checked) || checked > now || now - checked >= CARD_MAX_AGE) continue;
    const seen = new Set();
    const bouts = [...(event.fightCard ?? [])]
      .sort((a, b) => Number(b.bout === 'Main Event') - Number(a.bout === 'Main Event') || (a.order ?? 999) - (b.order ?? 999))
      .filter(bout => {
        if (bout.sourceStatus !== 'STATUS_SCHEDULED' ||
          ['cancelled', 'postponed', 'withdrawn', 'completed'].includes(bout.status) ||
          ![bout.f1, bout.f2].every(n => normalizeName(n) && !['tbd', 'tba', 'opponenttba', 'opponenttbd', 'porconfirmar'].includes(normalizeName(n))) ||
          normalizeName(bout.f1) === normalizeName(bout.f2)) return false;
        const key = fightKey(bout);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, limit).map(bout => ({
        ...bout, left: participant(bout, 'f1', people), right: participant(bout, 'f2', people),
      }));
    if (bouts.length) return {
      event, bouts, href: eventPath(event.slug),
      expires: Math.min(checked + CARD_MAX_AGE, Date.parse(event.date + 'T23:59:59-05:00') + 1000),
    };
  }
  return null;
}
