export function initFighterSearch() {
  const dialog = document.getElementById('search-overlay');
  const searchBtn = document.getElementById('search-toggle');
  const closeBtn = document.getElementById('search-close');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const hint = document.getElementById('search-hint');
  const retry = document.getElementById('search-retry');
  if (!dialog || !searchBtn || !closeBtn || !input || !results || !hint || !retry) return;
  const initialHint = 'Escribe al menos 2 letras para buscar';
  const norm = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let index = null;
  let pending = null;
  let loadFailed = false;
  let returnFocus = searchBtn;
  let previousOverflow = '';

  const render = () => {
    if (!dialog.open) return;
    results.replaceChildren();
    if (!loadFailed && document.activeElement === retry) input.focus();
    retry.hidden = !loadFailed;
    results.setAttribute('aria-busy', String(pending !== null));
    if (loadFailed) {
      hint.textContent = 'No pudimos cargar los peleadores. Revisa tu conexión y vuelve a intentarlo.';
      return;
    }
    if (!index) { hint.textContent = 'Cargando peleadores…'; return; }
    const query = norm(input.value.trim());
    if (query.length < 2) { hint.textContent = initialHint; return; }
    const matches = index.filter(f => f.searchText.includes(query)).slice(0, 20);
    hint.textContent = matches.length ? `${matches.length} resultado${matches.length === 1 ? '' : 's'}` : 'No encontramos peleadores con ese nombre. Prueba otro nombre o apodo.';
    const fragment = document.createDocumentFragment();
    for (const fighter of matches) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/peleadores/${encodeURIComponent(fighter.slug)}/`;
      link.className = 'flex items-center gap-4 py-3 px-2 hover:bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D928] focus-visible:-outline-offset-2';
      const avatar = document.createElement('div');
      avatar.className = 'w-12 h-12 rounded-full overflow-hidden bg-white/5 flex-shrink-0 border border-white/10';
      if (fighter.img) {
        const image = document.createElement('img');
        image.src = fighter.img;
        image.alt = '';
        image.loading = 'lazy';
        image.className = 'w-full h-full object-cover';
        image.addEventListener('error', () => image.remove(), { once: true });
        avatar.append(image);
      }
      const details = document.createElement('div');
      details.className = 'flex-1 min-w-0';
      const name = document.createElement('div');
      name.className = 'text-white text-sm font-semibold truncate';
      name.textContent = fighter.name;
      if (fighter.nick.trim()) {
        const nick = document.createElement('span');
        nick.className = 'text-gray-400 font-normal';
        nick.textContent = ` "${fighter.nick}"`;
        name.append(nick);
      }
      const division = document.createElement('div');
      division.className = 'text-gray-400 text-xs uppercase tracking-wider truncate';
      division.textContent = fighter.div;
      details.append(name, division);
      link.append(avatar, details);
      if (fighter.rank) {
        const rank = document.createElement('span');
        rank.className = 'text-[10px] font-black bg-[#F2D928] text-black px-2 py-0.5 rounded uppercase tracking-wider';
        rank.textContent = fighter.rank === 'C' ? 'Campeón' : `#${fighter.rank}`;
        link.append(rank);
      }
      item.append(link);
      fragment.append(item);
    }
    results.append(fragment);
  };

  const loadIndex = () => {
    if (index) { render(); return Promise.resolve(); }
    if (pending) { render(); return pending; }
    loadFailed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    pending = (async () => {
      try {
        const response = await fetch('/fighters-index.json', { signal: controller.signal });
        if (!response.ok) throw new Error('Index unavailable');
        const data = await response.json();
        if (!Array.isArray(data) || data.some(f => !f || typeof f.slug !== 'string' || typeof f.name !== 'string')) {
          throw new Error('Invalid index');
        }
        index = data.map(f => ({
          slug: f.slug, name: f.name,
          nick: typeof f.nick === 'string' ? f.nick : '',
          div: typeof f.div === 'string' ? f.div : '',
          img: typeof f.img === 'string' ? f.img : '',
          rank: typeof f.rank === 'string' ? f.rank : '',
          searchText: norm(`${f.name} ${typeof f.nick === 'string' ? f.nick : ''}`),
        }));
      } catch {
        loadFailed = true;
      } finally {
        window.clearTimeout(timeout);
        pending = null;
        render(); // Use the latest query, including text entered during loading.
      }
    })();
    render();
    return pending;
  };

  const openSearch = () => {
    if (dialog.open) return;
    const focused = document.activeElement;
    returnFocus = focused instanceof HTMLElement && focused !== document.body ? focused : searchBtn;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.getElementById('site-header').style.transform = 'translateY(0)';
    dialog.showModal();
    input.focus();
    void loadIndex();
  };
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    input.value = '';
    results.replaceChildren();
    results.setAttribute('aria-busy', 'false');
    hint.textContent = initialHint;
    retry.hidden = true;
    if (returnFocus.isConnected) returnFocus.focus();
  });
  searchBtn.addEventListener('click', openSearch);
  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('input, button, a[href]')]
      .filter(element => !element.disabled && !element.hidden && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });
  // Click outside the content area; native Escape handles cancellation.
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => {
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else openSearch();
    }
  });
  input.addEventListener('input', render);
  retry.addEventListener('click', () => { void loadIndex(); });
}
