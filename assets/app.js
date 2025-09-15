const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const API = window.API_BASE; // <-- ustawione w index.html
const LS_TOKEN = "ds_token";
const LS_CART  = "ds_cart";

let me = null;
let products = [];
let cart = JSON.parse(localStorage.getItem(LS_CART) || "[]");

function setCart(c){
  cart = c;
  localStorage.setItem(LS_CART, JSON.stringify(cart));
  $("#cartCount").textContent = String(cart.reduce((a,b)=>a+b.qty,0));
}
function money(n){ return (n||0).toFixed(2) + " zł"; }

function warn(msg){
  const w = $("#warn");
  w.textContent = msg;
  w.classList.remove("hidden");
}

async function fetchJSON(url, opts){
  try{
    const res = await fetch(url, opts);
    if(!res.ok) throw new Error(await res.text());
    return await res.json();
  }catch(e){
    throw e;
  }
}

async function fetchMe(){
  const token = localStorage.getItem(LS_TOKEN);
  if(!token){ me=null; $("#who").textContent="Gość"; $("#adminPanel").classList.add("hidden"); return; }
  try{
    me = await fetchJSON(`${API}/api/me`, {headers:{Authorization:`Bearer ${token}`}});
    $("#who").textContent = me.username + (me.admin?" (admin)":"");
    if(me.admin) $("#adminPanel").classList.remove("hidden");
  }catch{
    localStorage.removeItem(LS_TOKEN);
    me=null; $("#who").textContent="Gość";
  }
}

async function doLogin(code){
  const data = await fetchJSON(`${API}/api/auth/by-code`, {
    method:"POST", headers:{'Content-Type':'application/json'},
    body: JSON.stringify({code})
  });
  localStorage.setItem(LS_TOKEN, data.token);
  await fetchMe();
}

async function loadProducts(){
  const data = await fetchJSON(`${API}/api/products`);
  products = data.items || [];
  renderProducts();
}

function productCard(p){
  const img = p.image || "";
  const optHtml = p.options.map((o,i)=>`<option value="${i}">${o.label} — ${money(o.price)}</option>`).join("");
  return `
  <article class="product">
    <img src="${img}" alt="">
    <div class="body">
      <div class="title">${p.title}</div>
      <div class="muted">${p.description||""}</div>
      <select data-id="${p.id}" class="opt">${optHtml}</select>
      <button class="btn green" data-add="${p.id}">Dodaj do koszyka</button>
    </div>
  </article>`;
}

function renderProducts(){ $("#list").innerHTML = products.map(productCard).join(""); }

function renderCart(){
  const wrap = $("#cartItems");
  if(cart.length===0){ wrap.innerHTML = `<div class="muted">Koszyk jest pusty.</div>`; $("#sum").textContent=money(0); return; }
  wrap.innerHTML = cart.map((it,idx)=>`
    <div class="cartrow">
      <img src="${it.image||''}" alt="">
      <div>
        <div><b>${it.title}</b></div>
        <div class="muted">${it.variant}</div>
      </div>
      <div class="qty">
        <button data-dec="${idx}">−</button>
        <span>${it.qty}</span>
        <button data-inc="${idx}">+</button>
      </div>
      <div><b>${money(it.price*it.qty)}</b></div>
    </div>`).join("");
  $("#sum").textContent = money(cart.reduce((a,b)=>a+b.qty*b.price,0));
}

async function submitOrder(){
  const token = localStorage.getItem(LS_TOKEN);
  if(!token){ $("#loginModal").classList.remove("hidden"); return; }
  const payment = ($$("input[name=pay]")).find(x=>x.checked)?.value || "A";
  const data = await fetchJSON(`${API}/api/order`, {
    method:"POST",
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
    body: JSON.stringify({items:cart, payment})
  });
  if(data.bot_ok===false){
    alert("Bot offline – zamówienie zapisane w kolejce. Admin je obsłuży.");
  }else{
    alert("Zamówienie wysłane! Ticket: " + (data.ticket_url||""));
  }
  setCart([]);
  $("#cartModal").classList.add("hidden");
}

function addOptRow(label="", price="0.00", link=""){
  const row = document.createElement("div");
  row.className = "grid3";
  row.innerHTML = `
    <input placeholder="etykieta (np. 1 miesiąc)" value="${label}">
    <input type="number" step="0.01" placeholder="cena" value="${price}">
    <input placeholder="link docelowy (opcjonalnie)" value="${link}">
  `;
  $("#opts").appendChild(row);
}

async function adminSave(){
  const token = localStorage.getItem(LS_TOKEN);
  if(!token){ alert("Zaloguj się jako admin"); return; }

  let image = $("#p_image").value.trim();
  const file = $("#p_upload").files[0];
  if(file){
    const fd = new FormData();
    fd.append("file", file);
    const up = await fetchJSON(`${API}/api/upload`, {method:"POST", body:fd});
    image = up.url;
  }

  const options = [...$("#opts").children].map(r=>{
    const [a,b,c] = [...r.querySelectorAll("input")];
    return {label:a.value.trim(), price:parseFloat(b.value||"0"), link:c.value.trim()||null}
  }).filter(o=>o.label);

  const body = {
    id: $("#p_id").value.trim(),
    title: $("#p_title").value.trim(),
    description: $("#p_desc").value.trim(),
    image,
    options
  };

  await fetchJSON(`${API}/api/products`, {
    method:"POST",
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
    body: JSON.stringify(body)
  });
  await loadProducts();
  alert("Zapisano.");
}

document.addEventListener("click", async (e)=>{
  const t = e.target;
  if(t.matches("#btnCart")){ $("#cartModal").classList.remove("hidden"); renderCart(); }
  if(t.matches("#cartCancel")){ $("#cartModal").classList.add("hidden"); }
  if(t.matches("#btnLogin")){ $("#loginModal").classList.remove("hidden"); $("#loginErr").textContent=""; }
  if(t.matches("#loginOk")){
    try{ await doLogin($("#loginCode").value.trim()); $("#loginModal").classList.add("hidden"); location.hash="#shop"; }
    catch(err){ $("#loginErr").textContent = String(err); }
  }
  if(t.matches("[data-add]")){
    const id = t.getAttribute("data-add");
    const p = products.find(x=>x.id===id);
    const sel = t.parentElement.querySelector("select.opt");
    const opt = p.options[parseInt(sel.value)];
    const ex = cart.find(x=>x.id===p.id && x.variant===opt.label);
    if(ex){ ex.qty+=1; } else { cart.push({id:p.id,title:p.title,variant:opt.label,price:opt.price,qty:1,image:p.image||""}); }
    setCart(cart);
  }
  if(t.matches("[data-inc]")){ const i=+t.getAttribute("data-inc"); cart[i].qty++; setCart(cart); renderCart(); }
  if(t.matches("[data-dec]")){ const i=+t.getAttribute("data-dec"); cart[i].qty=Math.max(1,cart[i].qty-1); setCart(cart); renderCart(); }
  if(t.matches("#cartSubmit")){ try{ await submitOrder(); }catch(e){ alert("Błąd zamówienia: "+e); } }
  if(t.matches("#optAdd")){ addOptRow(); }
  if(t.matches("#optDel")){ const rows=[...$("#opts").children]; if(rows.length) rows.at(-1).remove(); }
  if(t.matches("#btnSave")){ try{ await adminSave(); }catch(e){ alert("Błąd zapisu: "+e); } }
});

(async function(){
  // Ostrzeżenie o mixed content
  if(location.protocol==="https:" && API.startsWith("http://")){
    warn("Ta strona jest na HTTPS, a API na HTTP – przeglądarka zablokuje połączenie. Wystaw API przez HTTPS albo uruchom frontend przez HTTP.");
  }
  addOptRow("1 miesiąc","10.00","");
  try{ await fetchMe(); await loadProducts(); }catch(e){ warn("API niedostępne: "+e); }
  setCart(cart);
  if(location.hash==="#login") $("#loginModal").classList.remove("hidden");
})();
