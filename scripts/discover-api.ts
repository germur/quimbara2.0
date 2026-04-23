/**
 * Script de descubrimiento: muestra qué endpoints y datos
 * devuelve API-Sports MMA con tu plan de pago.
 *
 * Run: npx tsx scripts/discover-api.ts
 */

const API_KEY = process.env.API_SPORTS_KEY ?? '';
const API_BASE = 'https://v1.mma.api-sports.io';

if (!API_KEY) {
  console.error('❌ Necesitas API_SPORTS_KEY en .env.local');
  process.exit(1);
}

async function get(path: string) {
  const res = await fetch(API_BASE + path, {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return res.json();
}

function show(label: string, data: unknown) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📌 ${label}`);
  console.log('─'.repeat(60));
  console.log(JSON.stringify(data, null, 2).slice(0, 2000)); // primeros 2000 chars
}

async function main() {
  console.log('🔍 Descubriendo API-Sports MMA...\n');

  // 1. Ligas disponibles
  const leagues = await get('/leagues');
  show('GET /leagues', leagues);

  // 2. Temporadas UFC (asumimos league=1 = UFC)
  const seasons = await get('/seasons?league=1');
  show('GET /seasons?league=1', seasons);

  // 3. Eventos próximos UFC 2025
  const events2025 = await get('/events?league=1&season=2025');
  show('GET /events?league=1&season=2025 (primeros resultados)', {
    total: (events2025 as any)?.results,
    sample: (events2025 as any)?.response?.slice(0, 2),
  });

  // 4. Eventos 2024 (por si 2025 está vacío)
  const events2024 = await get('/events?league=1&season=2024');
  show('GET /events?league=1&season=2024 (sample)', {
    total: (events2024 as any)?.results,
    sample: (events2024 as any)?.response?.slice(0, 1),
  });

  // 5. Fights de un evento concreto (usamos el primer evento que encontremos)
  const firstEvent = (events2025 as any)?.response?.[0] ?? (events2024 as any)?.response?.[0];
  if (firstEvent) {
    const eventId = firstEvent.id ?? firstEvent.event?.id;
    console.log(`\n   → Primer evento encontrado: ID=${eventId} nombre="${firstEvent.name ?? firstEvent.event?.name}"`);
    const fights = await get(`/fights?event=${eventId}`);
    show(`GET /fights?event=${eventId}`, {
      total: (fights as any)?.results,
      sample: (fights as any)?.response?.slice(0, 2),
    });
  }

  // 6. Fighter por ID (Islam Makhachev = 333 según fighters.json actual)
  const fighter = await get('/fighters?id=333');
  show('GET /fighters?id=333 (Islam Makhachev)', fighter);

  // 7. Próximos eventos por fecha
  const today = new Date().toISOString().slice(0, 10);
  const nextEvents = await get(`/events?league=1&date=${today}`);
  show(`GET /events?league=1&date=${today}`, nextEvents);

  // 8. Rankings
  const rankings = await get('/rankings?league=1&season=2025');
  show('GET /rankings?league=1&season=2025', rankings);

  console.log('\n\n✅ Descubrimiento completo. Revisa el output para planificar los endpoints.');
}

main().catch(err => { console.error(err); process.exit(1); });
