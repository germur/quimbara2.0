export function initRoundCursor() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const root = document.getElementById('rc-cursor');
  const position = document.getElementById('rc-pill-position');
  const dot = document.getElementById('rc-dot');
  const time = document.getElementById('rc-time');
  if (!root || !position || !dot || !time) return;

  let frame = null;
  let mx = 0, my = 0, px = 0, py = 0;
  let active = false;
  const allowed = () => fine.matches && !reduce.matches && !document.hidden && !document.querySelector('dialog[open]');
  const hide = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    active = false;
    root.classList.remove('visible', 'hover', 'click');
    document.documentElement.classList.remove('rc-on');
    time.textContent = '5:00';
  };
  const tick = () => {
    frame = null;
    if (!allowed() || !active) return;
    px += (mx - px) * 0.20;
    py += (my - py) * 0.20;
    const settled = Math.abs(mx - px) < 0.1 && Math.abs(my - py) < 0.1;
    if (settled) { px = mx; py = my; }
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate3d(-50%, -50%, 0)`;
    position.style.transform = `translate3d(${px + 16}px, ${py + 16}px, 0)`;
    if (!settled) frame = window.requestAnimationFrame(tick);
  };
  window.addEventListener('mousemove', event => {
    if (!allowed()) { hide(); return; }
    mx = event.clientX; my = event.clientY;
    if (!active) {
      px = mx; py = my;
      active = true;
      root.classList.add('visible');
      document.documentElement.classList.add('rc-on');
    }
    if (frame === null) frame = window.requestAnimationFrame(tick);
  }, { passive: true });
  window.addEventListener('mousedown', () => {
    if (active) root.classList.add('click');
  }, { passive: true });
  window.addEventListener('mouseup', () => root.classList.remove('click'), { passive: true });

  const hoverSelector = 'a, button, [role="button"], [data-cursor], input[type="submit"], .qb-wordmark, label[for], summary';
  document.addEventListener('mouseover', event => {
    if (active && event.target instanceof Element && event.target.closest(hoverSelector)) {
      root.classList.add('hover');
      time.textContent = '0:30';
    }
  }, { passive: true });
  document.addEventListener('mouseout', event => {
    if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest(hoverSelector)) {
      root.classList.remove('hover');
      time.textContent = '5:00';
    }
  }, { passive: true });
  document.addEventListener('mouseleave', hide);
  document.addEventListener('focusin', () => { if (!allowed()) hide(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  reduce.addEventListener('change', hide);
  fine.addEventListener('change', hide);
}
