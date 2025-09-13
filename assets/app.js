/* ===== CONFIG ===== */
const API_BASE = "https://api.sparkedservers.us"; // ← podmień na swój reverse proxy / port
const STORAGE_KEY = "ds_jwt";

/* ===== UTILS ===== */
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const authHeader = () => {
  const t = localStorage.getItem(STORAGE_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = n => (Math.round(Number(n) * 100) / 100).toFixed(2);

/* ===== STATE ===== */
let currentUser = null;
let products = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]"); // {id,title,qty,option{label,price}, imageUrl}

/* ===== STAR BG ===== */
(() => {
  const c = $("#stars");
  if (!c) return;
  const ctx = c.getContext("2d");
  const stars = new Array(140).fill(0).map(() => ({
    x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2
  }));
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  addEventListener("resize", resize); resize();
  const loop = () => {
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = "#0ea5e9";
    for (const s of stars) {
      const x = s.x * c.width, y = s.y * c.height;
      ctx.globalAlpha = 0.6 + Math.sin((performance.now()/700 + x + y)) * 0.2;
      ctx.beginPath(); ctx.arc(x,y,s.r,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(loop);
  };
  loop();
})();

/* ===== AUTH ===== */
async function fetchMe() {
  const r = await fetch(`${API_BASE}/api/me`, { headers: { ...authHeader() } });
  const j = await r.json();
  currentUser = j.ok ? j.user : null;
  updateUserBox();
}

function updateUserBox() {
  const box = $("#userBox");
  const loginBtn = $("#loginBtn");
  if (!box) return;
  if (currentUser) {
    box.textContent = currentUser.username + (currentUser.is_admin ? " (admin)" : "");
    $("#adminPanel")?.toggleAttribute("hidden", !currentUser.is_admin);
    loginBtn?.setAttribute("hidden", "");
  } else {
    box.textContent = "Gość";
    $("#adminPanel")?.setAttribute("hidden", "");
    loginBtn?.removeAttribute("hidden");
  }
}

async function doOtpLogin() {
  const code = $("#otpInput").value.trim();
  $("#loginMsg").textContent = "";
  const r = await fetch(`${API_BASE}/api/auth/by-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const j = await r.json();
  if (!j.ok) {
    $("#loginMsg").textContent = "Błędny lub zużyty kod.";
    return;
  }
  localStorage.setItem(STORAGE_KEY, j.token);
  // redirect do sklepu
  location.href = "./index.html";
}

/* ===== PRODUCTS ===== */
async function loadProducts() {
  const r = await fetch(`${API_BASE}/api/products`);
  const j = await r.json();
  products = j.products || [];
  renderGrid();
}

function renderGrid() {
  const g = $("#grid");
  if (!g) return;
  g.innerHTML = "";
  for (const p of products) {
    const card = document.createElement("div");
    card.className = "card product";
    card.innerHTML = `
      <img class="thumb" src="${p.imageUrl || ""}" alt="">
      <div class="title">${p.title}</div>
      <div class="desc">${p.description || ""}</div>
      <select class="opt"></select>
      <div class="actions">
        <button class="btn small add">Dodaj do koszyka</button>
        ${currentUser?.is_admin ? `<button class="btn small ghost del">Usuń</button>` : ""}
      </div>
    `;
    const sel = $(".opt", card);
    for (const o of p.options || []) {
      const opt = document.createElement("option");
      opt.value = o.label;
      opt.textContent = `${o.label} — ${fmt(o.price)} zł`;
      opt.dataset.price = o.price;
      sel.appendChild(opt);
    }

    $(".add", card).onclick = () => {
      if (!sel.selectedOptions[0]) return;
      const lab = sel.value;
      const price = Number(sel.selectedOptions[0].dataset.price || 0);
      const i = cart.findIndex(x => x.id === p.id && x.option?.label === lab);
      if (i >= 0) cart[i].qty++;
      else cart.push({ id: p.id, title: p.title, qty: 1, option: { label: lab, price }, imageUrl: p.imageUrl || "" });
      saveCart();
    };

    if (currentUser?.is_admin) {
      $(".del", card).onclick = async () => {
        if (!confirm("Usunąć produkt?")) return;
        await fetch(`${API_BASE}/api/products/${encodeURIComponent(p.id)}`, {
          method: "DELETE", headers: { ...authHeader() }
        });
        await loadProducts();
      };
    }

    g.appendChild(card);
  }
}

/* ===== ADMIN FORM ===== */
function addOptRow(label = "", price = "", link = "") {
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.innerHTML = `
    <input class="opt-label" placeholder="np. 1 miesiąc" value="${label}">
    <input class="opt-price" type="number" step="0.01" placeholder="cena" value="${price}">
    <input class="opt-link" placeholder="link docelowy (opcjonalnie)" value="${link}">
    <button class="btn small danger rm" type="button">×</button>
  `;
  $(".rm", wrap).onclick = () => wrap.remove();
  $("#optList").appendChild(wrap);
}

async function handleUploadIfAny() {
  const f = $("#p_file");
  if (!f.files || !f.files[0]) return null;
  const fd = new FormData();
  fd.append("file", f.files[0]);
  const r = await fetch(`${API_BASE}/api/upload`, {
    method: "POST", headers: { ...authHeader() }, body: fd
  });
  const j = await r.json();
  if (j.ok) return j.url;
  return null;
}

function bindAdmin() {
  $("#addOpt").onclick = () => addOptRow();
  addOptRow("1 miesiąc", "10.00");

  $("#productForm").onsubmit = async (e) => {
    e.preventDefault();
    const id = $("#p_id").value.trim();
    const title = $("#p_title").value.trim();
    let imageUrl = $("#p_image").value.trim();
    const desc = $("#p_desc").value.trim();

    if (!id || !title) { alert("Uzupełnij ID i Tytuł."); return; }

    if (!imageUrl) {
      const up = await handleUploadIfAny();
      if (up) imageUrl = up;
    }

    const options = $$("#optList .row").map(r => ({
      label: $(".opt-label", r).value.trim(),
      price: Number($(".opt-price", r).value),
      link: $(".opt-link", r).value.trim()
    })).filter(o => o.label && !isNaN(o.price));

    const body = { id, title, description: desc, imageUrl, options };
    const r = await fetch(`${API_BASE}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (j.ok) {
      e.target.reset(); $("#optList").innerHTML = ""; addOptRow();
      await loadProducts();
      alert("Zapisano.");
    } else {
      alert("Błąd zapisu.");
    }
  };
}

/* ===== KOSZYK ===== */
function saveCart(){ localStorage.setItem("cart", JSON.stringify(cart)); updateCartCount(); }
function updateCartCount(){ $("#cartCount").textContent = cart.reduce((a, c) => a + c.qty, 0); }

function openCart() {
  const modal = $("#cartModal");
  const list = $("#cartList");
  const tot = $("#cartTotal");
  list.innerHTML = "";

  let sum = 0;
  cart.forEach((it, idx) => {
    sum += it.qty * Number(it.option.price || 0);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <img src="${it.imageUrl || ""}" alt="">
      <div><b>${it.title}</b><div class="muted">${it.option.label}</div></div>
      <div class="qty">
        <button class="btn small" data-i="${idx}" data-a="-1">-</button>
        <span>${it.qty}</span>
        <button class="btn small" data-i="${idx}" data-a="1">+</button>
      </div>
      <div class="price">${fmt(it.option.price)} zł</div>
      <button class="btn small ghost rm" data-i="${idx}">×</button>
    `;
    list.appendChild(row);
  });
  tot.textContent = fmt(sum);

  list.onclick = (e) => {
    const i = e.target.dataset.i;
    if (e.target.matches(".rm")) {
      cart.splice(i, 1); saveCart(); openCart();
    } else if (e.target.matches("[data-a]")) {
      const d = Number(e.target.dataset.a);
      cart[i].qty = Math.max(1, cart[i].qty + d); saveCart(); openCart();
    }
  };

  modal.hidden = false;
}
function closeCart(){ $("#cartModal").hidden = true; }

async function confirmCart() {
  if (!currentUser) { alert("Zaloguj się najpierw."); return; }
  if (!cart.length) { closeCart(); return; }
  const pay = $('input[name="pay"]:checked').value;
  const r = await fetch(`${API_BASE}/api/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ items: cart, payment: pay })
  });
  const j = await r.json();
  if (j.ok) {
    const url = j.ticket_url;
    cart = []; saveCart(); closeCart();
    if (url) window.open(url, "_blank");
    alert("Zamówienie utworzone. Ticket na Discordzie został otwarty.");
  } else {
    alert("Błąd zamówienia.");
  }
}

/* ===== EVENTS / INIT ===== */
window.addEventListener("DOMContentLoaded", async () => {
  $("#otpBtn")?.addEventListener("click", doOtpLogin);

  $("#cartBtn")?.addEventListener("click", openCart);
  $("#cartCancel")?.addEventListener("click", closeCart);
  $("#cartConfirm")?.addEventListener("click", confirmCart);

  updateCartCount();
  await fetchMe();
  if (currentUser?.is_admin) bindAdmin();
  await loadProducts();
});
