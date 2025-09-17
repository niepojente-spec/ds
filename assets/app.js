// ==== KONFIG ====
// Front na GitHub Pages (HTTPS) -> API przez HTTPS (proxy / reverse).
// Jeśli masz inny cert/host, zmień poniższą linię:
const API_BASE = "https://api.sparkedservers.us:8091";

// ==== STAN ====
let TOKEN = localStorage.getItem("token") || "";
let ME = null;
let PRODUCTS = [];
let CART = []; // {id, option_index, qty}

// ==== UTYL ====
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };
const money = (v) => `${(Math.round(v * 100) / 100).toFixed(2)} zł`;

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const hasBody = typeof opts.body !== "undefined" && !(opts.body instanceof FormData);
  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

  const res = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    ...opts,
    headers,
  });

  if (!res.ok) {
    let txt = "";
    try { txt = await res.text(); } catch {}
    throw new Error(`${res.status} ${res.statusText} – ${txt}`);
  }
  if (res.status === 204) return null;
  return res.json();
}


function bindUI() {
  $("#cartBtn")?.addEventListener("click", showCart);
  $("#cartCancel")?.addEventListener("click", closeCart);
  $("#cartConfirm")?.addEventListener("click", submitOrder);

  $("#loginBtn")?.addEventListener("click", () => toggleModal("#loginModal", true));
  $("#loginCancel")?.addEventListener("click", () => toggleModal("#loginModal", false));
  $("#loginConfirm")?.addEventListener("click", loginWithCode);

  $("#optAdd")?.addEventListener("click", addOptionRow);
  $("#optDel")?.addEventListener("click", removeLastOptionRow);
  $("#p_upload")?.addEventListener("click", uploadImage);
  $("#saveProduct")?.addEventListener("click", saveProduct);
}

async function bootstrap() {
  try { ME = await me(); } catch { ME = null; }
  renderUser();
  try {
    await loadProducts();
    renderProducts();
  } catch (e) {
    alert("Nie udało się pobrać produktów. Sprawdź API_BASE i CORS.\n" + e.message);
  }
  if (ME?.is_admin) showAdmin();
}

function renderUser() {
  const badge = $("#userBadge");
  if (!badge) return;

  if (!ME) {
    badge.textContent = "Gość";
    $("#loginBtn")?.classList.remove("hidden");
    return;
  }

  // spróbuj wyświetlić ładną nazwę; fallback na user_id
  const display =
    ME.user_tag || ME.username || ME.global_name || ME.user_name || ME.user_id;

  badge.textContent = `${display}${ME.is_admin ? " (admin)" : ""}`;
  $("#loginBtn")?.classList.add("hidden");
}


async function me() { return api("/api/me"); }

async function loadProducts() {
  PRODUCTS = await api("/api/products", { method: "GET" });
}

function renderProducts() {
  const root = $("#products");
  if (!root) return;
  root.innerHTML = "";
  for (const p of PRODUCTS) {
    const card = el("div", "card product");

    const imgWrap = el("div", "product-img");
    const img = el("img");
    img.loading = "lazy";
    img.src = p.image || "https://dummyimage.com/600x400/1f2937/ffffff&text=Brak+obrazka";
    img.onerror = () => (img.src = "https://dummyimage.com/600x400/1f2937/ffffff&text=Brak+obrazka");
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    const title = el("h3"); title.textContent = p.title; card.appendChild(title);

    const desc = el("p"); desc.className = "muted"; desc.textContent = p.description || ""; card.appendChild(desc);

    const select = el("select");
    p.options.forEach((o, idx) => {
      const opt = el("option");
      opt.value = idx;
      opt.textContent = `${o.label} — ${money(o.price)}`;
      select.appendChild(opt);
    });
    card.appendChild(select);

    const btn = el("button", "btn btn-primary");
    btn.textContent = "Dodaj do koszyka";
    btn.onclick = () => { addToCart(p.id, parseInt(select.value, 10)); bumpCartBadge(); };
    card.appendChild(btn);

    root.appendChild(card);
  }
}

function addToCart(id, option_index, qty = 1) {
  const ex = CART.find((x) => x.id === id && x.option_index === option_index);
  if (ex) ex.qty += qty; else CART.push({ id, option_index, qty });
}

function bumpCartBadge() {
  const n = CART.reduce((a, b) => a + b.qty, 0);
  const b = $("#cartCount"); if (b) b.textContent = n;
}

function toggleModal(sel, on) { const m = $(sel); if (m) m.classList.toggle("hidden", !on); }
function showCart() { renderCart(); toggleModal("#cartModal", true); }
function closeCart() { toggleModal("#cartModal", false); }

function renderCart() {
  const box = $("#cartItems"); if (!box) return;
  box.innerHTML = "";
  let total = 0;

  for (const row of CART) {
    const p = PRODUCTS.find((x) => x.id === row.id); if (!p) continue;
    const opt = p.options[row.option_index];
    const price = opt.price * row.qty;
    total += price;

    const item = el("div", "cart-row");
    const img = el("img", "thumb");
    img.src = p.image || "https://dummyimage.com/64x64/1f2937/ffffff&text= ";
    img.onerror = () => (img.src = "https://dummyimage.com/64x64/1f2937/ffffff&text= ");
    item.appendChild(img);

    const info = el("div", "cart-info");
    info.innerHTML = `<div class="t1">${p.title}</div><div class="muted">${opt.label}</div>`;
    item.appendChild(info);

    const qtyBox = el("div", "qty");
    const minus = el("button", "btn btn-ghost"); minus.textContent = "–";
    const plus = el("button", "btn btn-ghost"); plus.textContent = "+";
    const num = el("div"); num.textContent = row.qty;
    minus.onclick = () => { row.qty = Math.max(1, row.qty - 1); renderCart(); bumpCartBadge(); };
    plus.onclick = () => { row.qty += 1; renderCart(); bumpCartBadge(); };
    qtyBox.append(minus, num, plus);
    item.appendChild(qtyBox);

    const priceBox = el("div", "price"); priceBox.textContent = money(price); item.appendChild(priceBox);

    const rm = el("button", "btn btn-ghost"); rm.textContent = "✕";
    rm.onclick = () => { CART = CART.filter(x => x !== row); renderCart(); bumpCartBadge(); };
    item.appendChild(rm);

    box.appendChild(item);
  }

  const totalBox = $("#cartTotal"); if (totalBox) totalBox.textContent = money(total);
}

async function submitOrder() {
  if (!ME) return alert("Najpierw się zaloguj.");
  if (!CART.length) return alert("Koszyk jest pusty.");
  const pay = document.querySelector('input[name="pay"]:checked')?.value || "A";
  try {
    const payload = { items: CART.map(x => ({ id: x.id, option_index: x.option_index, qty: x.qty })), payment: pay };
    const res = await api("/api/order", { method: "POST", body: JSON.stringify(payload) });
    alert(`Zamówienie przyjęte! Ticket: ${res.ticket_url}`);
    CART = []; bumpCartBadge(); closeCart();
  } catch (e) { alert("Błąd zamówienia: " + e.message); }
}

function makeEl(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}

function showLoginSuccess(name) {
  // overlay
  const wrap = makeEl("div", "login-success-overlay");
  const card = makeEl(
    "div",
    "login-success-card",
    `<div class="login-check">✔</div>
     <div class="login-title">Zalogowano</div>
     <div class="login-sub">jako <b>${name}</b></div>`
  );
  wrap.appendChild(card);

  // „zielone tekstury”/cząsteczki
  for (let i = 0; i < 30; i++) {
    const p = makeEl("div", "confetti");
    p.style.left = Math.random() * 100 + "vw";
    p.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
    p.style.animationDuration = (1.2 + Math.random() * 0.9).toFixed(2) + "s";
    wrap.appendChild(p);
  }

  document.body.appendChild(wrap);

  // auto hide / redirect z login.html po 1.2s
  setTimeout(() => {
    const onLoginPage = /\/login(\.html)?$/i.test(location.pathname);
    if (onLoginPage) {
      location.href = "./index.html";
    } else {
      wrap.remove();
    }
  }, 1200);
}


// ==== LOGIN ====
async function loginWithCode() {
  const code = $("#loginCode")?.value.trim();
  if (!code) return;

  try {
    const res = await api("/api/auth/by-code", { method: "POST", body: JSON.stringify({ code }) });
    TOKEN = res.token;
    localStorage.setItem("token", TOKEN);

    // jeśli jesteśmy na login.html – przenieś do sklepu
    const p = location.pathname.toLowerCase();
    const onLoginPage = p.endsWith("/login") || p.endsWith("/login.html");
    if (onLoginPage) {
      location.href = "./index.html";
      return;
    }

    // SPA (modal na indexie)
    toggleModal("#loginModal", false);
    ME = await me();
    renderUser();
  } catch (e) {
    alert("Nie udało się zalogować: " + e.message);
  }
}

// opcjonalnie: zatwierdzanie Enterem w polu kodu
document.addEventListener("DOMContentLoaded", () => {
  const input = $("#loginCode");
  input?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") loginWithCode();
  });
});


// ==== ADMIN ====
function showAdmin() {
  const p = $("#adminPanel"); if (p) p.classList.remove("hidden");
  if (!$("#optList")?.children.length) addOptionRow();
}
function optionRow(label = "1 miesiąc", price = 10, target = "") {
  const row = el("div", "opt-row");
  row.innerHTML = `
    <input placeholder="etykieta (np. 1 miesiąc)" value="${label}" />
    <input type="number" step="0.01" placeholder="cena" value="${price}" />
    <input placeholder="link docelowy (opcjonalnie)" value="${target}" />
  `;
  return row;
}
function addOptionRow() { $("#optList").appendChild(optionRow()); }
function removeLastOptionRow() { const list = $("#optList"); if (list.lastElementChild) list.removeChild(list.lastElementChild); }

async function uploadImage() {
  const f = $("#p_file")?.files?.[0]; if (!f) return;
  try {
    const fd = new FormData(); fd.append("file", f);
    const headers = {}; if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
    const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd, headers, mode: "cors" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    $("#p_image").value = data.url; alert("Wgrano obrazek.");
  } catch (e) { alert("Upload nie powiódł się: " + e.message); }
}

async function saveProduct() {
  const id = $("#p_id").value.trim();
  const title = $("#p_title").value.trim();
  const image = $("#p_image").value.trim();
  const description = $("#p_desc").value.trim();
  const options = [...$("#optList").children].map(row => {
    const [l, p, t] = row.querySelectorAll("input");
    return { label: l.value.trim(), price: parseFloat(p.value || "0"), target: t.value.trim() || null };
  });
  if (!id || !title || !options.length) return alert("Uzupełnij ID, tytuł i co najmniej jedną opcję.");

  try {
    await api("/api/products", { method: "POST", body: JSON.stringify({ id, title, image: image || null, description, options }) });
    await loadProducts(); renderProducts(); alert("Zapisano produkt.");
  } catch (e) { alert("Błąd zapisu: " + e.message); }
}
