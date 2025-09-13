/* =========================
   DS • Sklep — shop.js
   ========================= */

/* === Canvas particles (reakcja na mysz) === */
(() => {
  const c = document.getElementById('bg');
  if (!c) return;
  const ctx = c.getContext('2d');
  let w, h, particles = [];
  const COUNT = 140;

  function resize() { w = c.width = innerWidth; h = c.height = innerHeight; make(); }
  function make() {
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - .5) * 0.6,
      vy: (Math.random() - .5) * 0.6,
      r: Math.random() * 1.5 + 0.2
    }));
  }
  const mouse = { x: -1e9, y: -1e9 };
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

  function step() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(80,160,255,.8)';
    for (const p of particles) {
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = dx * dx + dy * dy;
      if (d < 9000) { p.vx += dx * -0.00002; p.vy += dy * -0.00002; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(step);
  }
  resize(); step(); addEventListener('resize', resize);
})();

/* === Helpers / API === */
const qs  = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const token = () => localStorage.getItem('jwt') || null;

const API = (path, opts = {}) =>
  fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token() ? { 'Authorization': 'Bearer ' + token() } : {}) },
    ...opts
  }).then(async r => {
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : {};
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { data });
    return data;
  }).catch(e => {
    console.error('API error:', e);
    throw e.data || { ok: false, error: 'NETWORK' };
  });

/* === Elementy === */
const $products     = qs('#products');
const buyModal      = qs('#buyModal');
const cartModal     = qs('#cartModal');
const adminPanel    = qs('#adminPanel');
const adminPanelBtn = qs('#adminPanelBtn');
const cartBtn       = qs('#cartBtn');
const cartCount     = qs('#cartCount');
const userAvatar    = qs('#userAvatar');
const userName      = qs('#userName');

/* === Stan === */
let ME = null;
let PRODUCTS = [];
let CART = JSON.parse(localStorage.getItem('cart') || '[]');
const saveCart = () => { localStorage.setItem('cart', JSON.stringify(CART)); updateCartBadges(); };

function updateCartBadges() {
  const c = CART.reduce((a, b) => a + (b.qty || 0), 0);
  cartCount.textContent = c;
}

/* === Start === */
init();

async function init() {
  // ME
  if (token()) {
    try {
      const m = await API('/api/me');
      if (m.ok) {
        ME = m.user;
        userName.textContent = ME.username || 'Użytkownik';
        if (ME.avatar) { userAvatar.src = ME.avatar; userAvatar.style.display = 'block'; }
        if (ME.is_admin) adminPanelBtn.hidden = false;
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.style.display = 'none'; // ukryj "Zaloguj"
      }
    } catch { /* zignoruj */ }
  }

  // Produkty
  try {
    const res = await API('/api/products');
    PRODUCTS = res.products || [];
  } catch {
    PRODUCTS = [];
  }
  renderProducts();
  updateCartBadges();

  // Handlery UI
  adminPanelBtn?.addEventListener('click', () => adminPanel.classList.remove('hidden'));
  qs('#adminClose')?.addEventListener('click', () => adminPanel.classList.add('hidden'));

  cartBtn.addEventListener('click', () => { renderCart(); cartModal.classList.remove('hidden'); });
  qs('#cartClose').addEventListener('click', () => cartModal.classList.add('hidden'));

  qs('#buyCancel').addEventListener('click', () => buyModal.classList.add('hidden'));
  qs('#cartCheckout').addEventListener('click', checkout);

  // Admin formularz
  qs('#addOption').addEventListener('click', addOptionRow);
  qs('#productForm').addEventListener('submit', submitProduct);
  addOptionRow(); // 1. wiersz wariantu domyślnie
}

/* === Render produktów === */
function renderProducts() {
  $products.innerHTML = '';
  PRODUCTS.forEach(p => {
    const article = document.createElement('article');
    article.className = 'card';
    article.innerHTML = `
      <div class="card__img">
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="">` : '<span style="opacity:.4">brak zdjęcia</span>'}
      </div>
      <div class="card__body">
        <h3>${escapeHtml(p.title)}</h3>
        <div class="tags">${(p.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        <p class="meta">${escapeHtml(p.description || '')}</p>
        <div class="price">${p.options?.[0] ? `${Number(p.options[0].price||0).toFixed(2)} zł` : '—'}</div>
        <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
          <button class="btn" data-id="${p.id}" data-action="buy">Kup</button>
          <button class="btn ghost" data-id="${p.id}" data-action="cart">Dodaj do koszyka</button>
          ${ME?.is_admin ? `
            <button class="btn ghost" data-id="${p.id}" data-action="edit">Edytuj</button>
            <button class="btn ghost" style="color:#ff8b8b;border-color:#3a151a" data-id="${p.id}" data-action="del">Usuń</button>
          ` : ''}
        </div>
      </div>
    `;
    article.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const id = btn.dataset.id; const prod = PRODUCTS.find(x => x.id === id);
      if (!prod) return;

      switch (btn.dataset.action) {
        case 'buy':  openBuy(prod); break;
        case 'cart': addToCart(prod, prod.options?.[0] || null); break;
        case 'edit': loadProductToForm(prod); break;
        case 'del':  delProduct(prod.id); break;
      }
    });
    $products.appendChild(article);
  });
}

/* === Modal KUP === */
function openBuy(p) {
  buyModal.classList.remove('hidden');
  qs('#buyTitle').textContent = `Kup • ${p.title}`;
  const box = qs('#buyOptions'); box.innerHTML = '';

  if (!p.options || !p.options.length) {
    box.innerHTML = `<p class="meta">Brak wariantów do wyboru.</p>`;
  } else {
    p.options.forEach((o, i) => {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.margin = '.35rem 0';
      row.innerHTML = `
        <span><input type="radio" name="opt" ${i === 0 ? 'checked' : ''} value="${i}"> ${escapeHtml(o.label)}</span>
        <b>${Number(o.price||0).toFixed(2)} zł</b>
      `;
      box.appendChild(row);
    });
  }

  qs('#buyAddToCart').onclick = () => {
    const chosen = box.querySelector('input[name="opt"]:checked');
    const idx = chosen ? Number(chosen.value) : 0;
    addToCart(p, (p.options || [])[idx] || null);
    buyModal.classList.add('hidden');
  };
}

/* === Koszyk === */
function addToCart(p, opt) {
  if (!opt) { alert('Brak wariantów dla tego produktu.'); return; }
  const idx = CART.findIndex(i => i.id === p.id && i.option?.label === opt.label);
  if (idx > -1) CART[idx].qty += 1;
  else CART.push({ id: p.id, title: p.title, option: { label: opt.label, price: Number(opt.price||0), link: opt.link || '' }, qty: 1 });
  saveCart();
}

function renderCart() {
  const box = qs('#cartList'); box.innerHTML = '';
  if (CART.length === 0) { box.innerHTML = '<p class="meta">Koszyk jest pusty.</p>'; return; }
  let sum = 0;

  CART.forEach((i, k) => {
    sum += Number(i.option.price || 0) * (i.qty || 1);
    const row = document.createElement('div'); row.className = 'item';
    row.innerHTML = `
      <div>
        <div><b>${escapeHtml(i.title)}</b> — ${escapeHtml(i.option.label)}</div>
        <div class="meta">${Number(i.option.price||0).toFixed(2)} zł × 
          <button class="btn ghost" data-k="${k}" data-act="dec">−</button>
          <b>${i.qty}</b>
          <button class="btn ghost" data-k="${k}" data-act="inc">+</button>
        </div>
      </div>
      <div><button class="btn ghost" data-k="${k}" data-act="del">Usuń</button></div>
    `;
    row.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const K = Number(b.dataset.k); const act = b.dataset.act;
      if (act === 'inc') CART[K].qty++;
      if (act === 'dec') CART[K].qty = Math.max(1, CART[K].qty - 1);
      if (act === 'del') CART.splice(K, 1);
      saveCart(); renderCart();
    });
    box.appendChild(row);
  });

  const sumEl = document.createElement('div');
  sumEl.style.textAlign = 'right'; sumEl.style.marginTop = '8px';
  sumEl.innerHTML = `<b>Razem: ${sum.toFixed(2)} zł</b>`;
  box.appendChild(sumEl);
}

async function checkout() {
  if (!token()) { alert('Zaloguj się, aby złożyć zamówienie.'); return; }
  if (!CART.length) { alert('Koszyk jest pusty.'); return; }
  const body = { items: CART, note: qs('#orderNote').value || "" };
  try {
    const res = await API('/api/order', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) {
      CART = []; saveCart();
      cartModal.classList.add('hidden');
      alert('Zamówienie wysłane ✔');
    } else {
      alert('Błąd zamówienia.');
    }
  } catch {
    alert('Błąd sieci podczas wysyłania.');
  }
}

/* === Admin panel === */
function addOptionRow(data = { label: '1 mies.', price: 0, link: '' }) {
  const wrap = qs('#optionsWrap');
  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '1fr 120px 1fr auto';
  row.style.gap = '8px';
  row.style.margin = '6px 0';
  row.innerHTML = `
    <input placeholder="Nazwa wariantu" value="${escapeAttr(data.label||'')}">
    <input type="number" step="0.01" placeholder="Cena" value="${Number(data.price||0)}">
    <input placeholder="Link docelowy (po Kup)" value="${escapeAttr(data.link||'')}">
    <button type="button" class="ghost">Usuń</button>
  `;
  row.querySelector('button').onclick = () => row.remove();
  wrap.appendChild(row);
}

function loadProductToForm(p) {
  adminPanel.classList.remove('hidden');
  const f = qs('#productForm');
  f.id.value = p.id || '';
  f.title.value = p.title || '';
  f.description.value = p.description || '';
  f.imageUrl.value = p.imageUrl || '';
  f.tags.value = (p.tags || []).join(',');
  qs('#optionsWrap').innerHTML = '';
  (p.options || []).forEach(o => addOptionRow(o));
}

async function submitProduct(e) {
  e.preventDefault();
  if (!ME?.is_admin) { alert('Brak uprawnień (admin).'); return; }
  const f = e.target;
  const options = [...qs('#optionsWrap').children].map(row => {
    const [l, p, ln] = row.querySelectorAll('input');
    return { label: l.value.trim(), price: Number(p.value || 0), link: (ln.value || '').trim() };
  }).filter(o => o.label && !isNaN(o.price));

  const payload = {
    id: f.id.value.trim(),
    title: f.title.value.trim(),
    description: f.description.value.trim(),
    imageUrl: f.imageUrl.value.trim(),
    tags: f.tags.value.split(',').map(s => s.trim()).filter(Boolean),
    options
  };
  if (!payload.id || !payload.title) { alert('Uzupełnij ID i Tytuł.'); return; }

  try {
    const res = await API('/api/products', { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) {
      const list = await API('/api/products');
      PRODUCTS = list.products || [];
      renderProducts();
      alert('Zapisano produkt ✔');
    } else {
      alert('Błąd zapisu produktu.');
    }
  } catch {
    alert('Błąd sieci przy zapisie produktu.');
  }
}

async function delProduct(id) {
  if (!ME?.is_admin) { alert('Brak uprawnień (admin).'); return; }
  if (!confirm('Usunąć ten produkt?')) return;
  try {
    const res = await API(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const list = await API('/api/products');
      PRODUCTS = list.products || [];
      renderProducts();
    } else {
      alert('Nie udało się usunąć.');
    }
  } catch {
    alert('Błąd sieci przy usuwaniu.');
  }
}

/* === Utility === */
function escapeHtml(s=''){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function escapeAttr(s=''){ return s.replace(/"/g, '&quot;'); }
