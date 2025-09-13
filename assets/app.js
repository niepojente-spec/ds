/* ===== CONFIG ===== */
const API_BASE = "https://api.sparkedservers.us";  // Twój reverse/proxy na backend (8091)
const STORAGE_KEY = "ds_jwt";

/* ===== UTILS ===== */
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const authHeader = () => {
  const t = localStorage.getItem(STORAGE_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = n => (Math.round(parseFloat(n || 0) * 100) / 100).toFixed(2);

/* ===== STATE ===== */
let currentUser = null;
let products = [];
let cart = JSON.parse(localStorage.getItem("ds_cart")||"[]"); // {id,title,qty,option:{label,price},imageUrl}

/* ===== BG particles ===== */
(() => {
  const c = $("#bg"); if (!c) return;
  const ctx = c.getContext("2d");
  let w, h, ps = [];
  const N = 140;
  function rs(){ w=c.width=innerWidth; h=c.height=innerHeight; ps=Array.from({length:N},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6,r:Math.random()*1.5+.2})); }
  const m={x:-1e9,y:-1e9}; addEventListener('mousemove',e=>{m.x=e.clientX;m.y=e.clientY;});
  function tick(){ ctx.clearRect(0,0,w,h); ctx.fillStyle='rgba(80,160,255,.8)'; for(const p of ps){const dx=p.x-m.x,dy=p.y-m.y,d=dx*dx+dy*dy;if(d<9000){p.vx+=dx*-0.00002;p.vy+=dy*-0.00002;} p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();} requestAnimationFrame(tick);}
  rs(); tick(); addEventListener('resize',rs);
})();

/* ===== AUTH ===== */
async function fetchMe() {
  try{
    const r = await fetch(`${API_BASE}/api/me`, { headers: { ...authHeader() } });
    const j = await r.json();
    currentUser = j.ok ? j.user : null;
  }catch{ currentUser = null; }
  updateUserBox();
}
function updateUserBox() {
  const box = $("#userBox");
  if (!box) return;
  if (currentUser) {
    box.textContent = currentUser.username + (currentUser.is_admin ? " (admin)" : "");
    $("#loginBtn")?.classList.add("hidden");
    $("#adminPanel")?.classList.toggle("hidden", !currentUser.is_admin);
  } else {
    box.textContent = "Gość";
    $("#loginBtn")?.classList.remove("hidden");
    $("#adminPanel")?.classList.add("hidden");
  }
}
async function doOtpLogin() {
  const code = $("#otpInput").value.trim();
  $("#loginMsg").textContent = "";
  try{
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
    await fetchMe();
    $("#loginMsg").textContent = "Zalogowano.";
    location.href = "./index.html"; // redirect do sklepu
  }catch{
    $("#loginMsg").textContent = "Błąd sieci.";
  }
}

/* ===== PRODUCTS ===== */
async function loadProducts() {
  try{
    const r = await fetch(`${API_BASE}/api/products`);
    const j = await r.json();
    products = j.products || [];
  }catch{ products = []; }
  renderGrid();
}
function renderGrid() {
  const g = $("#grid"); if (!g) return;
  g.innerHTML = "";
  for (const p of products) {
    const card = document.createElement("div");
    card.className = "card product";
    card.innerHTML = `
      <img class="thumb" src="${p.imageUrl || ""}" alt="">
      <div class="title">${p.title}</div>
      <div class="desc">${p.description || ""}</div>
      <div class="opts">
        <select class="opt"></select>
      </div>
      <div class="actions">
        <button class="btn small buy">Kup</button>
        <button class="btn small ghost add">Dodaj do koszyka</button>
        ${currentUser?.is_admin ? `<button class="btn small danger del">Usuń</button>` : ""}
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
      const lab = sel.value;
      const price = parseFloat(sel.selectedOptions[0]?.dataset.price || 0);
      addToCart(p, { label: lab, price });
      openCart();
    };
    $(".buy", card).onclick = () => openBuy(p);
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

/* ===== BUY MODAL ===== */
function openBuy(p){
  $("#buyTitle").textContent = `Kup • ${p.title}`;
  const box = $("#buyOptions");
  box.innerHTML = "";
  (p.options||[]).forEach((o,i)=>{
    const row = document.createElement('label');
    row.innerHTML = `<span><input type="radio" name="opt" ${i===0?'checked':''} value="${i}"> ${o.label}</span><b>${fmt(o.price)} zł</b>`;
    box.appendChild(row);
  });
  $("#buyAddToCart").onclick = () => {
    const chosen = box.querySelector('input[name="opt"]:checked');
    const idx = chosen?Number(chosen.value):0;
    const opt = (p.options||[])[idx];
    if(!opt){ alert('Brak wariantu'); return; }
    addToCart(p, {label: opt.label, price: parseFloat(opt.price)});
    $("#buyModal").classList.add('hidden');
    openCart();
  };
  $("#buyModal").classList.remove('hidden');
}
$("#buyCancel")?.addEventListener('click', ()=> $("#buyModal").classList.add('hidden'));

/* ===== CART ===== */
function persistCart(){ localStorage.setItem("ds_cart", JSON.stringify(cart)); }
function updateCartCount(){ $("#cartCount").textContent = cart.reduce((a,c)=>a+c.qty,0); }

function addToCart(p, option){
  const idx = cart.findIndex(i => i.id===p.id && i.option?.label===option.label);
  if (idx>-1) cart[idx].qty += 1;
  else cart.push({ id:p.id, title:p.title, qty:1, option, imageUrl: p.imageUrl || "" });
  persistCart(); updateCartCount();
}
function renderCart(){
  const list = $("#cartList"); list.innerHTML = "";
  if(!cart.length){ list.innerHTML = `<div class="muted">Koszyk jest pusty.</div>`; $("#cartTotal").textContent="0.00"; return; }
  let sum = 0;
  cart.forEach((it, idx) => {
    const price = parseFloat(it.option?.price || 0);
    sum += (it.qty||1) * price;
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <img class="thumb" src="${it.imageUrl||''}" alt="">
      <div class="title">${it.title}</div>
      <div class="muted">${it.option?.label||''}</div>
      <div class="qty">
        <button class="btn small" data-i="${idx}" data-a="-1">-</button>
        <span>${it.qty}</span>
        <button class="btn small" data-i="${idx}" data-a="1">+</button>
      </div>
      <div class="price">${fmt(price)} zł</div>
      <button class="btn small danger rm" data-i="${idx}">×</button>
    `;
    list.appendChild(row);
  });
  $("#cartTotal").textContent = fmt(sum);

  list.onclick = (e) => {
    const i = e.target.dataset.i;
    if (e.target.matches(".rm")) {
      cart.splice(i, 1);
    } else if (e.target.matches("[data-a]")) {
      const d = Number(e.target.dataset.a);
      cart[i].qty = Math.max(1, (cart[i].qty||1) + d);
    } else return;
    persistCart(); renderCart(); updateCartCount();
  };
}
function openCart(){ renderCart(); $("#cartModal").classList.remove('hidden'); }
function closeCart(){ $("#cartModal").classList.add('hidden'); }
$("#cartBtn")?.addEventListener("click", openCart);
$("#cartCancel")?.addEventListener("click", closeCart);

async function confirmCart() {
  if (!currentUser) { alert("Zaloguj się najpierw."); return; }
  if (!cart.length) { closeCart(); return; }
  const pay = $('input[name="pay"]:checked')?.value || "Nie wybrano";
  try{
    const r = await fetch(`${API_BASE}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ items: cart, payment: pay })
    });
    const j = await r.json();
    if (j.ok) {
      cart = []; persistCart(); updateCartCount(); closeCart();
      if (j.ticket_url) window.open(j.ticket_url, "_blank");
      alert("Zamówienie utworzone. Otworzono ticket na Discordzie.");
    } else {
      alert("Błąd zamówienia: " + (j.error || j.detail || "spróbuj ponownie"));
    }
  }catch{ alert("Błąd sieci przy zamówieniu."); }
}
$("#cartConfirm")?.addEventListener("click", confirmCart);

/* ===== ADMIN ===== */
function addOptRow(label = "", price = "", link = "") {
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.innerHTML = `
    <input class="opt-label" placeholder="np. 1 miesiąc" value="${label}">
    <input class="opt-price" type="number" step="0.01" placeholder="cena" value="${price}">
    <input class="opt-link" placeholder="Link przekierowania po Kup (opcjonalnie)" value="${link}">
  `;
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
  alert("Upload nieudany: " + (j.detail || "sprawdź uprawnienia bota"));
  return null;
}
function setupUploader(){
  const drop = $("#imgDrop"); const file = $("#p_file"); const prev = $("#imgPreview"); const inner=$("#imgInner");
  if(!drop || !file) return;
  const openPicker=()=>file.click();
  drop.addEventListener('click', openPicker);
  drop.addEventListener('dragover',e=>{e.preventDefault(); drop.classList.add('drag');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
  drop.addEventListener('drop',e=>{
    e.preventDefault(); drop.classList.remove('drag');
    const f=e.dataTransfer.files?.[0]; if(f){ file.files = e.dataTransfer.files; preview(); }
  });
  file.addEventListener('change', preview);
  function preview(){
    const f=file.files?.[0]; if(!f) return;
    const url=URL.createObjectURL(f); prev.src=url; prev.style.display='block'; inner.querySelector('p').textContent='Wybrano obrazek';
  }
}
function bindAdmin() {
  $("#addOpt").onclick = () => addOptRow();
  if (!$("#optList").children.length) addOptRow("1 miesiąc", "10.00", "");

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
      price: parseFloat($(".opt-price", r).value),
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
      alert("Błąd zapisu: " + (j.error || j.detail || "spróbuj ponownie"));
    }
  };
}

/* ===== INIT ===== */
window.addEventListener("DOMContentLoaded", async () => {
  $("#otpBtn")?.addEventListener("click", doOtpLogin);

  await fetchMe();
  if (currentUser?.is_admin) bindAdmin();
  setupUploader();
  await loadProducts();

  // jeśli stare wpisy w koszyku miały brak ceny -> odfiltruj
  cart = cart.map(it => ({...it, option:{...it.option, price: parseFloat(it.option?.price||0)}}));
  localStorage.setItem("ds_cart", JSON.stringify(cart));
  updateCartCount();
});
