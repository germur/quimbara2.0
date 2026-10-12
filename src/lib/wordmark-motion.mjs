// CSS animates transforms; JavaScript only manages visibility and preferences.
export function initWordmarkMotion() {
  const marks = [...document.querySelectorAll('.qb-wordmark')];
  if (!marks.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set();
  const update = () => {
    const canAnimate = !document.hidden && !reduce.matches && !document.querySelector('dialog[open]');
    for (const mark of marks) {
      const active = visible.has(mark) && canAnimate;
      if (active) mark.classList.add('qb-animated');
      mark.classList.toggle('qb-paused', !active);
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    update();
  });
  const start = () => marks.forEach(mark => observer.observe(mark));
  // Let the initial page load complete before starting decorative motion.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  document.addEventListener('visibilitychange', update);
  document.addEventListener('focusin', update);
  reduce.addEventListener('change', update);
}
