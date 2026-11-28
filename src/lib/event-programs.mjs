import { expandAnnouncedNames, normalizeName } from './event-data.mjs';
import { eventIdentity } from './event-routing.mjs';

export const programLabels = {
  early: 'Preliminares iniciales',
  prelims: 'Preliminares',
  main: 'Cartelera estelar',
};

export function programForEvent(event, programs) {
  if (['cancelled', 'postponed'].includes(event.status)) return undefined;
  const { f1, f2 } = expandAnnouncedNames(event);
  const eventId = eventIdentity(event.slug);
  return programs.find(program => program.eventId === eventId && program.date === event.date &&
    normalizeName(program.f1) === normalizeName(f1) && normalizeName(program.f2) === normalizeName(f2));
}
