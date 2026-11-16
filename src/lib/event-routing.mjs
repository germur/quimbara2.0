import registry from '../data/event-urls.json' with { type: 'json' };

export function eventSlug(slug) {
  return registry.events.find(e => e.aliases.includes(slug) || e.slug === slug)?.slug ?? slug;
}
export function eventIdentity(slug) {return registry.events.find(e=>e.aliases.includes(slug)||e.slug===slug)?.id ?? slug;}
export function eventAliases(slug) {
  const record=registry.events.find(e=>e.aliases.includes(slug)||e.slug===slug||e.id===slug);
  return record?[...new Set([record.id,...record.aliases,record.slug])]:[slug];
}
export const eventPath = slug => `/eventos/${eventSlug(slug)}/`;

// Keep the original data IDs: quiniela configuration and saved picks use them.
export function canonicalEvents(events) {
  const groups = new Map();
  for (const event of events) {
    const key = eventSlug(event.slug);
    const previous = groups.get(key);
    const definition = registry.events.find(e => e.slug === key);
    if (!previous || event.slug === definition?.primarySlug ||
        (previous.main === 'TBD' && event.main !== 'TBD')) groups.set(key, event);
  }
  return [...groups.values()].sort((a,b) => a.date.localeCompare(b.date));
}
