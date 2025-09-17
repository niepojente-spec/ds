// ==== KONFIG ====
const API_BASE = "https://YOUR-API-HOST:8091"; // <=== PODMIEŃ na swój adres API (bez końcowego '/')

// ==== STAN ====
let TOKEN = localStorage.getItem("token") || "";
let ME = null;
let PRODUCTS = [];
let CART = []; // {id, option_index, qty}

// ==== UTYL ====
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };
const money = (v) => `${(Math.round(v * 100) / 100).toFixed(2)} zł`;

const dummy600 = "https://dummyimage.com/600x400/1f2937/ffffff&text=Brak+obrazka";
const dummy64  = "https://dummyimage.com/64x64/1f2937/ffffff&text= ";

function resolveImage(url, size = 600) {
  if (!url) return size === 64 ? dummy64 : dummy600;
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`; // np. "/uploads/xxx.png" -> "https://host/uploads/xxx.png"
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  headers["Content-Type"] = headers["Content-Type"] || "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} – ${txt}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ==== UI INIT ====
window.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  await bootstrap();
});

function bindUI() {
  $("#cartBtn").onclick = showCart;
  $("#cartCancel").onclick = closeCart;
  $("#cartConfirm").onclick = submitOrder;

  $("#loginBtn").onclick = () => toggleModal("#loginModal", true);
  $("#loginCancel").onclick = () => toggleModal("#loginModal", false);
  $("#loginConfirm").onclick = loginWithCode;

  $("#optAdd").onclick = addOptionRow;
  $("#optDel").onclick = removeLastOptionRow;
  $("#p_upload").onclick = uploadImage;
  $("#saveProduct").onclick = saveProduct;
}

async function bootstrap() {
  try { ME = await me(); } catch { ME = null; }
  renderUser();
  await loadProducts();
  renderProducts();
  if (ME?.is_admin) showAdmin();
  bumpCartBadge();
}

function renderUser() {
  $("#userBadge").textContent = ME ? `${ME.user_id}${ME.is_admin ? " (admin)" : ""}` : "Gość";
  $("#loginBtn").classList.toggle("hidden", !!ME);
}

async function me() { return api("/api/me"); }

async function loadProducts() {
  PRODUCTS = await api("/api/products", { method: "GET", headers: { "Content-Type": "application/json" } });
}

function renderProducts() {
  const root = $("#products");
  root.innerHTML = "";
  for (const p of PRODUCTS) {
    const card = el("div", "card product");

    const imgWrap = el("div", "product-img");
    const img = el("img");
    img.loading = "lazy";
    img.src = resolveImage(p.image, 600);
    img.onerror = () => (img.src = dummy600);
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    const title = el("h3"); title.textContent = p.title; card.appendChild(title);
    const desc = el("p"); desc.className = "muted"; desc.textContent = p.description || ""; card.appendChild(desc);

    const select = el("select");
    p.options.forEach((o, idx) => {
      const opt = el("option"); opt.value = idx; opt.textContent = `${o.label} — ${money(o.price)}`; select.appendChild(opt);
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

function bumpCartBadge() { $("#cartCount").textContent = CART.reduce((a, b) => a + b.qty, 0); }

function toggleModal(sel, on) { $(sel).classList.toggle("hidden", !on); }

function showCart() { renderCart(); toggleModal("#cartModal", true); }
function closeCart() { toggleModal("#cartModal", false); }

function renderCart() {
  const box = $("#cartItems");
  box.innerHTML = "";
  let total = 0;

  for (const row of CART) {
    const p = PRODUCTS.find((x) => x.id === row.id);
    if (!p) continue;
    const opt = p.options[row.option_index];
    const price = opt.price * row.qty;
    total += price;

    const item = el("div", "cart-row");

    const img = el("img", "thumb");
    img.src = resolveImage(p.image, 64);
    img.onerror = () => (img.src = dummy64);
    item.appendChild(img);

    const info = el("div", "cart-info");
    info.innerHTML = `<div class="t1">${p.title}</div><div class="muted">${opt.label}</div>`;
    item.appendChild(info);

    const qtyBox = el("div", "qty");
    const minus = el("button", "btn btn-ghost"); minus.textContent = "–";
    const plus  = el("button", "btn btn-ghost"); plus.textContent = "+";
    const num = el("div"); num.textContent = row.qty;
    minus.onclick = () => { row.qty = Math.max(1, row.qty - 1); renderCart(); bumpCartBadge(); };
    plus.onclick  = () => { row.qty += 1; renderCart(); bumpCartBadge(); };
    qtyBox.append(minus, num, plus);
    item.appendChild(qtyBox);

    const priceBox = el("div", "price"); priceBox.textContent = money(price); item.appendChild(priceBox);

    const rm = el("button", "btn btn-ghost"); rm.textContent = "✕";
    rm.onclick = () => { CART = CART.filter(x => x !== row); renderCart(); bumpCartBadge(); };
    item.appendChild(rm);

    box.appendChild(item);
  }
  $("#cartTotal").textContent = money(total);
}

async function submitOrder() {
  if (!ME) { alert("Najpierw się zaloguj."); return; }
  if (!CART.length) { alert("Koszyk jest pusty."); return; }
  const pay = document.querySelector('input[name="pay"]:checked')?.value || "A";
  try {
    const payload = { items: CART.map((x) => ({ id: x.id, option_index: x.option_index, qty: x.qty })), payment: pay };
    const res = await api("/api/order", { method: "POST", body: JSON.stringify(payload) });
    alert(`Zamówienie przyjęte! Ticket: ${res.ticket_url}`);
    CART = []; bumpCartBadge(); closeCart();
  } catch (e) { alert("Błąd zamówienia: " + e.message); }
}

// ==== LOGIN ====
async function loginWithCode() {
  const code = $("#loginCode").value.trim();
  if (!code) return;
  try {
    const res = await api("/api/auth/by-code", { method: "POST", body: JSON.stringify({ code }), headers: { "Content-Type": "application/json" } });
    TOKEN = res.token; localStorage.setItem("token", TOKEN);
    toggleModal("#loginModal", false);
    ME = await me(); renderUser();
  } catch (e) { alert("Nie udało się zalogować: " + e.message); }
}

// ==== ADMIN ====
function showAdmin() {
  $("#adminPanel").classList.remove("hidden");
  if (!$("#optList").children.length) addOptionRow();
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
function removeLastOptionRow() {
  const list = $("#optList"); if (list.lastElementChild) list.removeChild(list.lastElementChild);
}

async function uploadImage() {
  const f = $("#p_file").files[0]; if (!f) return;
  try {
    const fd = new FormData(); fd.append("file", f);
    const headers = {}; if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
    const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd, headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json(); $("#p_image").value = data.url; alert("Wgrano obrazek.");
  } catch (e) { alert("Upload nie powiódł się: " + e.message); }
}

async function saveProduct() {
  const id = $("#p_id").value.trim();
  const title = $("#p_title").value.trim();
  const image = $("#p_image").value.trim();
  const description = $("#p_desc").value.trim();
  const options = [...$("#optList").children].map((row) => {
    const [l, p, t] = row.querySelectorAll("input");
    return { label: l.value.trim(), price: parseFloat(p.value || "0"), target: t.value.trim() || null };
  });

  if (!id || !title || !options.length) { alert("Uzupełnij ID, tytuł i co najmniej jedną opcję."); return; }

  try {
    await api("/api/products", { method: "POST", body: JSON.stringify({ id, title, image: image || null, description, options }) });
    await loadProducts(); renderProducts(); alert("Zapisano produkt.");
  } catch (e) { alert("Błąd zapisu: " + e.message); }
}
