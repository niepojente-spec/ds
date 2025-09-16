const $ = (q, root=document)=>root.querySelector(q);
const $$ = (q, root=document)=>[...root.querySelectorAll(q)];
const API = () => window.API_BASE?.replace(/\/$/,'') || '';

let jwtTok = localStorage.getItem('token') || '';
let cart = [];

function fmt(x){ return (Number(x)||0).toFixed(2) + ' zł'; }

function uiAuth(){
  $('#userInfo').textContent = jwtTok ? 'Zalogowano' : 'Gość';
  $('#loginBtn').classList.toggle('hidden', !!jwtTok);
  $('#logoutBtn').classList.toggle('hidden', !jwtTok);
}

function uiCart(){
  const box = $('#cart'); box.innerHTML = '';
  let total = 0;
  for(const it of cart){
    total += it.unit_price * it.qty;
    const row = document.createElement('div'); row.className = 'item';
    row.innerHTML = `
      <div><b>${it.title}</b><br><span class="badge">${it.option_label||''}</span></div>
      <div>x ${it.qty}</div>
      <div>${fmt(it.unit_price*it.qty)}</div>
    `;
    box.appendChild(row);
  }
  $('#total').textContent = fmt(total);
}

async function loadProducts(){
  const res = await fetch(API()+"/api/products");
  const data = await res.json();
  const wrap = $('#products'); wrap.innerHTML = '';
  for(const p of data){
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `
      ${p.image ? `<img src="${p.image}" alt="">` : `<div style="height:140px;border:1px dashed var(--outline);border-radius:10px;display:grid;place-items:center;color:var(--muted)">brak obrazka</div>`}
      <h3>${p.title}</h3>
      <div class="badge">${p.description||''}</div>
      <div class="row">
        <select class="opt"></select>
        <input type="number" min="1" value="1" style="width:80px" />
      </div>
      <div class="row">
        <button class="btn add">Dodaj</button>
        <span class="badge">od ${fmt(p.base_price)}</span>
      </div>
    `;
    const sel = $('.opt', el);
    (p.options||[]).forEach(o=>{
      const op = document.createElement('option');
      op.value = o.label; op.dataset.price = o.price;
      op.textContent = `${o.label} — ${fmt(o.price)}`;
      sel.appendChild(op);
    });
    $('.add', el).onclick = ()=>{
      const qty = Number($('input[type=number]', el).value||1);
      const opt = sel.selectedOptions[0];
      const price = Number(opt?.dataset.price || p.base_price || 0);
      cart.push({
        product_id: p.id,
        option_label: opt?.value || null,
        qty, unit_price: price, title: p.title
      });
      uiCart();
    };
    wrap.appendChild(el);
  }
}

async function loginByCode(){
  const code = $('#loginCode').value.trim();
  if(!code) return;
  $('#msg').textContent = 'Logowanie...';
  try{
    const res = await fetch(API()+"/api/auth/by-code", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({code})
    });
    if(!res.ok){ throw new Error(await res.text()); }
    const data = await res.json();
    jwtTok = data.token; localStorage.setItem('token', jwtTok);
    $('#msg').textContent = 'Zalogowano.';
    uiAuth();
  }catch(e){
    $('#msg').textContent = 'Błąd logowania: '+e.message;
  }
}

async function submitOrder(){
  if(!jwtTok){ $('#msg').textContent='Najpierw zaloguj się kodem z Discorda.'; return; }
  if(!cart.length){ $('#msg').textContent='Koszyk jest pusty.'; return; }
  const pay = $('input[name=pay]:checked')?.value || 'A';
  $('#msg').textContent = 'Wysyłanie zamówienia...';
  try{
    const res = await fetch(API()+"/api/order",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+jwtTok
      },
      body: JSON.stringify({items: cart, payment: pay})
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data?.detail||res.statusText);
    $('#msg').innerHTML = `✅ Zamówienie ${data.order_id} utworzone. <a href="${data.ticket_url}" target="_blank">Przejdź do ticketu</a>`;
    cart = []; uiCart();
  }catch(e){
    $('#msg').textContent = 'Błąd zamówienia: '+e.message;
  }
}

function bindUI(){
  $('#confirmLogin').onclick = loginByCode;
  $('#submitBtn').onclick = submitOrder;
  $('#cancelBtn').onclick = ()=>{ cart=[]; uiCart(); };
  $('#loginBtn').onclick = ()=>{ $('#loginCode').focus(); };
  $('#logoutBtn').onclick = ()=>{
    jwtTok=''; localStorage.removeItem('token');
    uiAuth();
  };
}

(async function start(){
  bindUI();
  uiAuth();
  uiCart();
  await loadProducts();
})();
