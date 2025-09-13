// === Canvas particles (mouse reactive) ===
(() => {
  const c = document.getElementById('bg');
  const ctx = c.getContext('2d');
  let w,h,particles = [];
  const R=1.2, COUNT=140;

  function resize(){ w=c.width=innerWidth; h=c.height=innerHeight; make(); }
  function make(){
    particles = Array.from({length:COUNT}, _=>({
      x: Math.random()*w,
      y: Math.random()*h,
      vx: (Math.random()-.5)*0.6,
      vy: (Math.random()-.5)*0.6,
      r: Math.random()*1.5+0.2
    }));
  }
  const mouse={x:-1e9,y:-1e9};
  addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
  function step(){
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgba(80,160,255,.8)';
    for(const p of particles){
      const dx=p.x-mouse.x, dy=p.y-mouse.y, d=dx*dx+dy*dy;
      if(d<9000){ p.vx += dx* -0.00002; p.vy += dy* -0.00002; }
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>w) p.vx*=-1;
      if(p.y<0||p.y>h) p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(step);
  }
  resize(); step(); addEventListener('resize',resize);
})();

// === API & State ===
const API = (path, opts={}) =>
  fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type':'application/json', ...(token()?{'Authorization':'Bearer '+token()}: {}) },
    ...opts
  }).then(r=>r.json());

const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const $products = qs('#products');
const buyModal = qs('#buyModal');
const cartModal = qs('#cartModal');
const adminPanel = qs('#adminPanel');
const adminPanelBtn = qs('#adminPanelBtn');
const cartBtn = qs('#cartBtn');
const cartCount = qs('#cartCount');
const userAvatar = qs('#userAvatar');
const userName = qs('#userName');

let ME = null;
let PRODUCTS = [];
let CART = JSON.parse(localStorage.getItem('cart')||'[]');
function saveCart(){ localStorage.setItem('cart', JSON.stringify(CART)); cartCount.textContent = CART.reduce((a,b)=>a+b.qty,0); }
function token(){ return localStorage.getItem('jwt')||null; }

init();

async function init(){
  // ME
  if(token()){
    try{
      const m = await API('/api/me'); 
      if(m.ok){ ME = m.user; userName.textContent = ME.username; if(ME.avatar){ userAvatar.src = ME.avatar; userAvatar.style.display='block'; } if(ME.is_admin){ adminPanelBtn.hidden=false; } }
    }catch{}
  }
  // Products
  const res = await API('/api/products');
  PRODUCTS = res.products||[];
  renderProducts();
  saveCart();

  adminPanelBtn?.addEventListener('click', ()=> adminPanel.classList.remove('hidden'));
  qs('#adminClose').addEventListener('click', ()=> adminPanel.classList.add('hidden'));
  cartBtn.addEventListener('click', ()=> { renderCart(); cartModal.classList.remove('hidden'); });
  qs('#cartClose').addEventListener('click', ()=> cartModal.classList.add('hidden'));
  qs('#buyCancel').addEventListener('click', ()=> buyModal.classList.add('hidden'));
  qs('#cartCheckout').addEventListener('click', checkout);
  qs('#addOption').addEventListener('click', addOptionRow);
  qs('#productForm').addEventListener('submit', submitProduct);
  addOptionRow(); // pierwszy wiersz
}

function renderProducts(){
  $products.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const el = document.createElement('article');
    el.className='card';
    el.innerHTML = `
      <div class="card__img">${p.imageUrl?`<img src="${p.imageUrl}" alt="">`:'<span style="opacity:.5">brak</span>'}</div>
      <div class="card__body">
        <h3>${p.title}</h3>
        <div class="tags">${(p.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
        <p class="meta">${p.description||''}</p>
        <div class="price">${p.options?.[0]?`${p.options[0].price.toFixed(2)} zł`:'—'}</div>
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button class="btn" data-id="${p.id}" data-action="buy">Kup</button>
          <button class="btn ghost" data-id="${p.id}" data-action="cart">Dodaj do koszyka</button>
          ${ME?.is_admin?`<button class="btn ghost" data-id="${p.id}" data-action="edit">Edytuj</button>
          <button class="btn ghost" style="color:#ff8b8b;border-color:#3a151a" data-id="${p.id}" data-action="del">Usuń</button>`:''}
        </div>
      </div>
    `;
    el.addEventListener('click', (e)=>{
      const btn = e.target.closest('button'); if(!btn) return;
      const id = btn.dataset.id; const p = PRODUCTS.find(x=>x.id===id);
      if(btn.dataset.action==='buy') openBuy(p);
      if(btn.dataset.action==='cart') { addToCart(p, p.options?.[0]||null); }
      if(btn.dataset.action==='edit') loadProductToForm(p);
      if(btn.dataset.action==='del') delProduct(p.id);
    });
    $products.appendChild(el);
  });
}

function openBuy(p){
  buyModal.classList.remove('hidden');
  qs('#buyTitle').textContent = `Kup • ${p.title}`;
  const box = qs('#buyOptions'); box.innerHTML='';
  (p.options||[]).forEach((o,i)=>{
    const id = `opt_${i}`;
    const row = document.createElement('label');
    row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.margin='.3rem 0';
    row.innerHTML = `
      <span><input type="radio" name="opt" ${i===0?'checked':''} value="${i}"> ${o.label}</span>
      <b>${o.price.toFixed(2)} zł</b>
    `;
    box.appendChild(row);
  });
  qs('#buyAddToCart').onclick = ()=>{
    const idx = Number((new FormData(new FormDataShim(qs('#buyOptions'))).get('opt') ?? '0'));
    addToCart(p, p.options[idx]);
    buyModal.classList.add('hidden');
  };
}
// helper: zbieranie radio w divie
function FormDataShim(root){ this.root=root; this.get=n=> (root.querySelector(`[name="${n}"]:checked`)||{}).value; }

function addToCart(p,opt){
  if(!opt){ alert('Brak wariantów.'); return; }
  const idx = CART.findIndex(i=>i.id===p.id && i.option.label===opt.label);
  if(idx>-1) CART[idx].qty += 1; else CART.push({id:p.id, title:p.title, option:opt, qty:1});
  saveCart();
}

function renderCart(){
  const box = qs('#cartList'); box.innerHTML='';
  if(CART.length===0){ box.innerHTML='<p class="meta">Koszyk jest pusty.</p>'; return; }
  let sum=0;
  CART.forEach((i,k)=>{
    sum += i.option.price*i.qty;
    const row = document.createElement('div'); row.className='item';
    row.innerHTML = `
      <div>
        <div><b>${i.title}</b> — ${i.option.label}</div>
        <div class="meta">${i.option.price.toFixed(2)} zł × 
          <button class="btn ghost" data-k="${k}" data-act="dec">−</button>
          <b>${i.qty}</b>
          <button class="btn ghost" data-k="${k}" data-act="inc">+</button>
        </div>
      </div>
      <div><button class="btn ghost" data-k="${k}" data-act="del">Usuń</button></div>
    `;
    row.addEventListener('click', e=>{
      const b = e.target.closest('button'); if(!b) return;
      const k = Number(b.dataset.k); const act = b.dataset.act;
      if(act==='inc') CART[k].qty++;
      if(act==='dec') CART[k].qty = Math.max(1, CART[k].qty-1);
      if(act==='del') CART.splice(k,1);
      saveCart(); renderCart();
    });
    box.appendChild(row);
  });
  const sumEl = document.createElement('div'); sumEl.style.textAlign='right'; sumEl.style.marginTop='6px'; sumEl.innerHTML = `<b>Razem: ${sum.toFixed(2)} zł</b>`;
  box.appendChild(sumEl);
}

async function checkout(){
  if(!token()){ alert('Zaloguj się, aby kupić.'); return; }
  if(CART.length===0){ alert('Koszyk pusty.'); return; }
  const body = { items:CART, note: qs('#orderNote').value||"" };
  const res = await API('/api/order', { method:'POST', body: JSON.stringify(body) });
  if(res.ok){ CART=[]; saveCart(); cartModal.classList.add('hidden'); alert('Zamówienie wysłane ✔'); }
  else alert('Błąd zamówienia');
}

// === Admin panel ===
function addOptionRow(data={label:'1 mies.', price:0, link:''}){
  const wrap = qs('#optionsWrap');
  const row = document.createElement('div'); row.style.display='grid'; row.style.gridTemplateColumns='1fr 120px 1fr auto'; row.style.gap='8px'; row.style.margin='6px 0';
  row.innerHTML = `
    <input placeholder="Nazwa wariantu (np. 1 mies.)" value="${data.label||''}">
    <input type="number" step="0.01" placeholder="Cena" value="${data.price||0}">
    <input placeholder="Link docelowy (po kliknięciu Kup)" value="${data.link||''}">
    <button type="button" class="ghost">Usuń</button>
  `;
  row.querySelector('button').onclick = ()=> row.remove();
  wrap.appendChild(row);
}
function loadProductToForm(p){
  adminPanel.classList.remove('hidden');
  const f = qs('#productForm');
  f.id.value = p.id; f.title.value = p.title; f.description.value = p.description||""; f.imageUrl.value = p.imageUrl||""; f.tags.value = (p.tags||[]).join(',');
  qs('#optionsWrap').innerHTML='';
  (p.options||[]).forEach(o=> addOptionRow(o));
}
async function submitProduct(e){
  e.preventDefault();
  if(!ME?.is_admin){ alert('Brak uprawnień.'); return; }
  const f = e.target;
  const options = [...qs('#optionsWrap').children].map(row=>{
    const [l,p,ln] = row.querySelectorAll('input');
    return {label:l.value.trim(), price:Number(p.value||0), link:ln.value.trim()};
  }).filter(o=>o.label && !isNaN(o.price));
  const payload = {
    id: f.id.value.trim(),
    title: f.title.value.trim(),
    description: f.description.value.trim(),
    imageUrl: f.imageUrl.value.trim(),
    tags: f.tags.value.split(',').map(s=>s.trim()).filter(Boolean),
    options
  };
  const res = await API('/api/products', {method:'POST', body: JSON.stringify(payload)});
  if(res.ok){
    // odśwież
    const list = await API('/api/products'); PRODUCTS = list.products||[]; renderProducts();
    alert('Zapisano produkt ✔');
  }else alert('Błąd zapisu');
}
async function delProduct(id){
  if(!confirm('Usunąć produkt?')) return;
  const res = await API(`/api/products/${encodeURIComponent(id)}`, {method:'DELETE'});
  if(res.ok){ const list = await API('/api/products'); PRODUCTS=list.products||[]; renderProducts(); }
  else alert('Błąd usuwania');
}
