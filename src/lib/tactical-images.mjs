// Shared by the carousel and the build-time image generator.
export const tacticalImages = Array.from({ length: 14 }, (_, i) =>
  `/images/tactical-blueprint/page-${String(i + 1).padStart(2, '0')}.png`
);
