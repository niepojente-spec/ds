/* ========= KONFIG ========= */
// !!! PODMIEŃ na swój reverse proxy host (widoczny z przeglądarki)
const API_BASE = "https://api.sparkedservers.us"; 
const STORAGE_KEY = "ds_jwt";

/* ========= UTIL ========= */
const $ = (q, r=document)=>r.querySelector(q);
const $$ = (q, r=document)=>[...r.querySelectorAll(q)];
const authHeader = () => {
  const t = localStorage.getItem(STORAGE_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = n => (Math.round(Number(n||0)*100)/100).toFixed(2);
const toast = (m)=>alert(m);

/* ========= BG CANVAS ========= */
(() => {
  const c = $("#bg"); if(!c) return;
  const ctx = c.getContext("2d");
  let W,H; const stars = [];
  function rs(){ W=c.width=innerWidth; H=c.height=innerHeight; stars.length=0;
    for(let i=0;i<160;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.2+.2,v:(Math.random()-.5)*.3});
  }
  function tick(){
    ctx.clearRect(0,0,W,H); ctx.fillStyle="#3b82f6";
    for(const s of stars){ s.x+=s.v; if(s.x<0) s.x=W; if(s.x>W) s.x=0;
      ctx.globalAlpha = .35 + .35*Math.sin((performance.now()/800 + s.x + s.y)*.01);
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  rs(); tick(); addEventListener("resize", rs);
})();

/* ========= STATE ========= */
let me = null;
let products = [];
let cart = JSON.parse(localStorage.getItem("ds_cart")||"[]"); // {id,title,qty,option:{label,price,link},imageUrl}

/* ========= AUTH ========= */
async function fetchMe(){
  const r = await fetch(`${API_BASE}/api/me`, { headers: { ...authHeader() }});
  const j = await r.json();
  me = j.user || null;
  const box = $("#userBox");
  if(me){
    box.textContent = me.username + (me.is_admin ? " (admin)" : "");
    $("#adminPanel")?.classList.toggle("hidden", !me.is_admin);
    $("#loginLink")?.classList.add("hidden");
  }else{
    box.textContent = "Gość";
    $("#adminPanel")?.classList.add("hidden");
    $("#loginLink")?.classList.remove("hidden");
  }
  updateCartCount();
}

async function doOtpLogin(){
  const code = $("#otpInput").value.trim();
  $("#loginMsg").textContent = "";
  if(!code){ $("#loginMsg").textContent = "Podaj kod."; return; }
  const r = await fetch(`${API_BASE}/api/auth/by-code`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ code }) });
  const j = await r.json();
  if(!j.ok){ $("#loginMsg").textContent = "Błędny lub wygasły kod."; return; }
  localStorage.setItem(STORAGE_KEY, j.token);
  $("#loginMsg").textContent = "Zalogowano. Przenoszę do sklepu…";
  setTimeout(()=> location.assign("./"), 500);
}

/* ========= PRODUCTS ========= */
async function loadProducts(){
  const r = await fetch(`${API_BASE}/api/products`);
  const j = await r.json();
  products = j.products || [];
  renderGrid();
}

function renderGrid(){
  const g = $("#grid");
  g.innerHTML = "";
  for(const p of products){
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img class="thumb" alt="" src="${p.imageUrl||""}">
      <div class="body">
        <h3>${escapeHtml(p.title)}</h3>
        <div class="muted">${escapeHtml(p.description||"")}</div>
        <div class="row">
          <select class="opt"></select>
        </div>
        <div class="actions">
          <button class="btn add">Dodaj do koszyka</button>
          ${me?.is_admin ? `<button class="btn ghost edit">Edytuj</button><button class="btn ghost rm">Usuń</button>` : ""}
        </div>
      </div>`;
    const sel = $(".opt", card);
    (p.options||[]).forEach(o=>{
      const op = document.createElement("option");
      op.value = o.label;
      op.dataset.price = o.price;
      op.textContent = `${o.label} — ${fmt(o.price)} zł`;
      sel.appendChild(op);
    });

    $(".add", card).onclick = () => {
      if(!sel.value){ toast("Produkt bez wariantów."); return; }
      const opt = sel.selectedOptions[0];
      const item = { id:p.id, title:p.title, imageUrl:p.imageUrl||"", qty:1, option:{ label:opt.value, price:Number(opt.dataset.price||0), link: "" } };
      // łącz identyczne pozycje
      const idx = cart.findIndex(i=>i.id===item.id && i.option.label===item.option.label);
      if(idx>-1) cart[idx].qty += 1; else cart.push(item);
      persistCart();
    };

    if(me?.is_admin){
      $(".rm", card).onclick = async () => {
        if(!confirm("Usunąć produkt?")) return;
        await fetch(`${API_BASE}/api/products/${encodeURIComponent(p.id)}`, { method:"DELETE", headers:{ ...authHeader() } });
        await loadProducts();
      };
      $(".edit", card).onclick = () => loadToForm(p);
    }

    g.appendChild(card);
  }
}

/* ========= ADMIN FORM ========= */
function addOptRow(label="", price="", link=""){
  const wrap = document.createElement("div");
  wrap.className = "opt-row";
  wrap.innerHTML = `
    <input class="opt-label" placeholder="np. 1 miesiąc" value="${escapeAttr(label)}">
    <input class="opt-price" type="number" step="0.01" placeholder="cena" value="${price}">
    <input class="opt-link" placeholder="link docelowy (opcjonalnie)" value="${escapeAttr(link)}">
    <button class="rm" type="button">×</button>`;
  $(".rm", wrap).onclick = ()=> wrap.remove();
  $("#optList").appendChild(wrap);
}

async function handleUploadIfAny(){
  const f = $("#p_file");
  if(!f.files || !f.files[0]) return null;
  const fd = new FormData(); fd.append("file", f.files[0]);
  const r = await fetch(`${API_BASE}/api/upload`, { method:"POST", headers:{ ...authHeader() }, body: fd });
  const j = await r.json();
  return j.ok ? j.url : null;
}

function loadToForm(p){
  $("#adminPanel").classList.remove("hidden");
  $("#p_id").value = p.id || "";
  $("#p_title").value = p.title || "";
  $("#p_image").value = p.imageUrl || "";
  $("#p_desc").value = p.description || "";
  $("#optList").innerHTML = "";
  (p.options||[]).forEach(o=> addOptRow(o.label, o.price, o.link||""));
  if(!p.options?.length) addOptRow("1 miesiąc","10.00","");
  scrollTo({top:0,behavior:"smooth"});
}

function bindAdmin(){
  $("#addOpt").onclick = ()=> addOptRow();
  addOptRow("1 miesiąc","10.00","");
  $("#productForm").onsubmit = async (e)=>{
    e.preventDefault();
    if(!me?.is_admin){ toast("Brak uprawnień."); return; }
    const id = $("#p_id").value.trim();
    const title = $("#p_title").value.trim();
    let imageUrl = $("#p_image").value.trim();
    const desc = $("#p_desc").value.trim();
    if(!id || !title){ toast("Uzupełnij ID i Tytuł."); return; }
    if(!imageUrl){
      const up = await handleUploadIfAny();
      if(up) imageUrl = up;
    }
    const options = $$("#optList .opt-row").map(r=>({
      label: $(".opt-label", r).value.trim(),
      price: Number($(".opt-price", r).value),
      link: $(".opt-link", r).value.trim()
    })).filter(o=>o.label && !isNaN(o.price));
    const body = { id, title, description: desc, imageUrl, options };
    const r = await fetch(`${API_BASE}/api/products`, { method:"POST", headers:{ "Content-Type":"application/json", ...authHeader() }, body: JSON.stringify(body) });
    const j = await r.json();
    if(j.ok){ e.target.reset(); $("#optList").innerHTML=""; addOptRow(); await loadProducts(); toast("Zapisano ✔"); }
    else toast("Błąd zapisu.");
  };
}

/* ========= CART ========= */
function persistCart(){ localStorage.setItem("ds_cart", JSON.stringify(cart)); updateCartCount(); }
function updateCartCount(){ $("#cartCount").textContent = cart.reduce((a,c)=>a+(c.qty||0),0); }

function openCart(){
  const modal = $("#cartModal"); const list = $("#cartList"); list.innerHTML="";
  let sum = 0;
  cart.forEach((it, i)=>{
    sum += Number(it.option.price||0) * Number(it.qty||0);
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <img src="${it.imageUrl||""}" alt="">
      <div><b>${escapeHtml(it.title)}</b><div class="muted">${escapeHtml(it.option.label)}</div></div>
      <div class="qty">
        <button class="btn ghost" data-i="${i}" data-a="-1">-</button>
        <b>${it.qty}</b>
        <button class="btn ghost" data-i="${i}" data-a="1">+</button>
      </div>
      <div class="price">${fmt(it.option.price)} zł</div>
      <button class="btn ghost" data-i="${i}" data-act="rm">×</button>`;
    row.onclick = (e)=>{
      const i = e.target.dataset.i;
      if(e.target.dataset.act==="rm"){ cart.splice(i,1); persistCart(); openCart(); return; }
      if(e.target.dataset.a){ const d = Number(e.target.dataset.a); cart[i].qty = Math.max(1, cart[i].qty + d); persistCart(); openCart(); }
    };
    list.appendChild(row);
  });
  $("#cartTotal").textContent = `${fmt(sum)} zł`;
  modal.classList.remove("hidden");
}
function closeCart(){ $("#cartModal").classList.add("hidden"); }

async function confirmCart(){
  if(!me){ toast("Zaloguj się, aby złożyć zamówienie."); return; }
  if(!cart.length){ closeCart(); return; }
  const pay = $('input[name="pay"]:checked').value;
  const r = await fetch(`${API_BASE}/api/order`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", ...authHeader() },
    body: JSON.stringify({ items: cart, payment: pay })
  });
  const j = await r.json();
  if(j.ok){
    cart = []; persistCart(); closeCart();
    if(j.ticket_url) window.open(j.ticket_url, "_blank");
    toast("Zamówienie wysłane. Otworzono ticket na Discordzie.");
  }else toast("Błąd zamówienia.");
}

/* ========= HELPERS ========= */
function escapeHtml(s=""){ return s.replace(/[&<>\"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m])); }
function escapeAttr(s=""){ return s.replace(/"/g,"&quot;"); }

/* ========= INIT ========= */
window.addEventListener("DOMContentLoaded", async ()=>{
  // login page
  $("#otpBtn")?.addEventListener("click", doOtpLogin);

  // cart modal
  $("#cartBtn")?.addEventListener("click", openCart);
  $("#cartCancel")?.addEventListener("click", closeCart);
  $("#cartConfirm")?.addEventListener("click", confirmCart);

  await fetchMe();
  if(me?.is_admin) bindAdmin();
  await loadProducts();
});
