import { load } from 'cheerio';
import { expandAnnouncedNames, normalizeName } from '../../src/lib/event-data.mjs';
import { canonicalEvents, eventIdentity } from '../../src/lib/event-routing.mjs';

const labels = new Map([
  ['earlyprelims', 'early'], ['preliminaresiniciales', 'early'],
  ['prelims', 'prelims'], ['preliminares', 'prelims'],
  ['maincard', 'main'], ['carteleraestelar', 'main'], ['carteleraprincipal', 'main'],
]);
const editorDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const lastNameMatches = (full, name) => {
  const short = normalizeName(name);
  return short.length >= 3 && normalizeName(full).endsWith(short);
};

export function parseOfficialPrograms(html) {
  const $ = load(html);
  return $('#events-list-upcoming .l-listing__item.views-row').toArray().flatMap(row => {
    const headline = $(row).find('.c-card-event--result__headline a').first();
    const path = headline.attr('href') ?? '';
    const fighters = headline.text().trim().split(/\s+vs\.?\s+/i);
    if (!/^\/event\/[a-z0-9-]+\/?$/.test(path) || fighters.length !== 2) return [];

    const byKind = new Map();
    let ambiguous = false;
    for (const column of $(row).find('.c-listing-viewing-option__column--left').toArray()) {
      const label = $(column).find('.c-listing-viewing-option__fight-card').text();
      const kind = labels.get(normalizeName(label));
      const seconds = Number($(column).find('[data-timestamp]').attr('data-timestamp'));
      if (!kind || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 4e9) continue;
      if (byKind.has(kind) && byKind.get(kind) !== seconds) ambiguous = true;
      byKind.set(kind, seconds);
    }
    if (!byKind.has('main') || ambiguous) return [];
    const starts = [...byKind.values()];
    const main = byKind.get('main');
    const first = Math.min(...starts);
    if (Math.max(...starts) !== main || main - first > 12 * 3600) return [];
    const segments = [...byKind].sort((a, b) => a[1] - b[1])
      .map(([kind, seconds]) => ({ kind, startUTC: new Date(seconds * 1000).toISOString() }));
    const dates = [...new Set([
      editorDate.format(new Date(first * 1000)),
      editorDate.format(new Date(main * 1000)),
    ])];
    return [{ path, fighters, dates, segments }];
  });
}

export function refreshOfficialPrograms(events, previous, official, checkedAt) {
  const programs = new Map(previous.map(program => [program.eventId, program]));
  let matched = 0;
  for (const event of canonicalEvents(events)) {
    if (!event.main || event.main === 'TBD' || ['cancelled', 'postponed'].includes(event.status)) continue;
    const names = expandAnnouncedNames(event);
    const eventId = eventIdentity(event.slug);
    const number = event.name.match(/^UFC\s+(\d+)$/i)?.[1];
    const matches = official.filter(({ path, dates, fighters: [first, second] }) => dates.includes(event.date) &&
      (!number || path.replace(/\/$/, '') === '/event/ufc-' + number) &&
      ((lastNameMatches(names.f1, first) && lastNameMatches(names.f2, second)) ||
       (lastNameMatches(names.f2, first) && lastNameMatches(names.f1, second))));
    if (matches.length !== 1) continue;
    const [{ path, segments }] = matches;
    const saved = programs.get(eventId);
    // Keep region-specific coverage only while the source identifies the same event.
    const broadcast = saved?.date === event.date ? saved.broadcast : undefined;
    programs.set(eventId, { eventId, date: event.date, ...names, sourceUrl: 'https://www.ufc.com' + path,
      checkedAt, segments, ...(broadcast ? { broadcast } : {}) });
    matched++;
  }
  return { matched, programs: [...programs.values()].sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId)) };
}
