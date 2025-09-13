/* =========================
   DS • Sklep — shop.js
   ========================= */

/* === Canvas particles === */
(() => {
  const c = document.getElementById('bg'); if (!c) return;
  const ctx = c.getContext('2d');
  let w,h,ps=[]; const N=140;
  function rs(){ w=c.width=innerWidth; h=c.height=innerHeight; ps=Array.from({length:N},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6,r:Math.random()*1.5+.2})); }
  const m={x:-1e9,y:-1e9}; addEventListener('mousemove',e=>{m.x=e.clientX;m.y=e.clientY;});
  function tick(){ ctx.clearRect(0,0,w,h); ctx.fillStyle='rgba(80,160,255,.8)'; for(const p of ps){const dx=p.x-m.x,dy=p.y-m.y,d=dx*dx+dy*dy;if(d<9000){p.vx+=dx*-0.00002;p.vy+=dy*-0.00002;} p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>w)p.vx*=-1;if(p.y<0||p.y>h)p.vy*=-1;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();} requestAnimationFrame(tick);}
  rs(); tick(); addEventListener('resize',rs);
})();

/* === Helpers / API === */
const qs  = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const token = () => localStorage.getItem('jwt') || null;

const API = (path, opts = {}) =>
  fetch(`${API_BASE_URL}${path}`, {
    headers: { ...(opts.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(token()?{'Authorization':'Bearer '+token()}: {}) },
    ...opts
  }).then(async r=>{
    const ct=r.headers.get('content-type')||''; const data=ct.includes('application/json')?await r.json():{};
    if(!r.ok) throw Object.assign(new Error('HTTP '+r.status),{data});
    return data;
  }).catch(e=>{ console.error('API error:',e); throw e.data||{ok:false,error:'NETWORK'}; });

/* === Elements === */
const $products     = qs('#products');
const buyModal      = qs('#buyModal');
const cartModal     = qs('#cartModal');
const adminPanel    = qs('#adminPanel');
const adminPanelBtn = qs('#adminPanelBtn');
const cartBtn       = qs('#cartBtn');
const cartCount     = qs('#cartCount');
const userAvatar    = qs('#userAvatar');
const userName      = qs('#userName');

const imgDrop     = qs('#imgDrop');
const imgInput    = qs('#imgInput');
const imgInner    = qs('#imgInner');
const imgPreview  = qs('#imgPreview');
const imageUrlInp = qs('#imageUrl');
const basePrice   = qs('#basePrice');
const submitBtn   = qs('#submitProduct');

/* === State === */
let ME = null;
let PRODUCTS = [];
let CART = JSON.parse(localStorage.getItem('cart')||'[]');
const saveCart = () => { localStorage.setItem('cart', JSON.stringify(CART)); updateCartBadges(); };
function updateCartBadges(){ cartCount.textContent = CART.reduce((a,b)=>a+(b.qty||0),0); }

/* === Init === */
init();

async function init(){
  // Me
  if(token()){
    try{
      const m = await API('/api/me');
      if(m.ok){
        ME = m.user; userName.textContent = ME.username || 'Użytkownik';
        if(ME.avatar){ userAvatar.src = ME.avatar; userAvatar.style.display='block'; }
        if(ME.is_admin) adminPanelBtn.hidden=false;
        const loginBtn = document.getElementById('loginBtn'); if(loginBtn) loginBtn.style.display='none';
      }
    }catch{}
  }

  // Products
  try{ const res = await API('/api/products'); PRODUCTS = res.products||[]; }catch{ PRODUCTS = []; }
  renderProducts(); updateCartBadges();

  // UI handlers
  adminPanelBtn?.addEventListener('click', ()=> adminPanel.classList.remove('hidden'));
  qs('#adminClose')?.addEventListener('click', ()=> adminPanel.classList.add('hidden'));

  cartBtn.addEventListener('click', ()=> { renderCart(); cartModal.classList.remove('hidden'); });
  qs('#cartClose').addEventListener('click', ()=> cartModal.classList.add('hidden'));

  qs('#buyCancel').addEventListener('click', ()=> buyModal.classList.add('hidden'));
  qs('#cartCheckout').addEventListener('click', checkout);

  // Admin form
  qs('#addOption').addEventListener('click', addOptionRow);
  qs('#productForm').addEventListener('submit', submitProduct);
  addOptionRow(); // 1 rząd wariantu (opcjonalne)

  // Uploader drag & drop
  setupUploader();
}

/* === Products render === */
function renderProducts(){
  $products.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const el=document.createElement('article'); el.className='card';
    el.innerHTML = `
      <div class="card__img">${p.imageUrl?`<img src="${p.imageUrl}" alt="">`:'<span style="opacity:.4">brak zdjęcia</span>'}</div>
      <div class="card__body">
        <h3>${escapeHtml(p.title)}</h3>
        <p class="meta">${escapeHtml(p.description||'')}</p>
        <div class="price">${p.options?.[0]?`${Number(p.options[0].price||0).toFixed(2)} zł`:'—'}</div>
        <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
          <button class="btn" data-id="${p.id}" data-action="buy">Kup</button>
          <button class="btn ghost" data-id="${p.id}" data-action="cart">Dodaj do koszyka</button>
          ${ME?.is_admin?`
            <button class="btn ghost" data-id="${p.id}" data-action="edit">Edytuj</button>
            <button class="btn ghost" style="color:#ff8b8b;border-color:#3a151a" data-id="${p.id}" data-action="del">Usuń</button>
          `:''}
        </div>
      </div>`;
    el.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b) return;
      const id=b.dataset.id; const prod=PRODUCTS.find(x=>x.id===id); if(!prod) return;
      if(b.dataset.action==='buy') openBuy(prod);
      if(b.dataset.action==='cart') addToCart(prod, prod.options?.[0]||null);
      if(b.dataset.action==='edit') loadProductToForm(prod);
      if(b.dataset.action==='del') delProduct(prod.id);
    });
    $products.appendChild(el);
  });
}

/* === Buy modal === */
function openBuy(p){
  buyModal.classList.remove('hidden');
  qs('#buyTitle').textContent = `Kup • ${p.title}`;
  const box = qs('#buyOptions'); box.innerHTML='';
  if(!p.options || !p.options.length){
    box.innerHTML='<p class="meta">Brak wariantów.</p>';
  }else{
    p.options.forEach((o,i)=>{
      const row=document.createElement('label');
      row.style.display='flex';row.style.justifyContent='space-between';row.style.alignItems='center';row.style.margin='.35rem 0';
      row.innerHTML=`<span><input type="radio" name="opt" ${i===0?'checked':''} value="${i}"> ${escapeHtml(o.label)}</span><b>${Number(o.price||0).toFixed(2)} zł</b>`;
      box.appendChild(row);
    });
  }
  qs('#buyAddToCart').onclick=()=>{
    const chosen=box.querySelector('input[name="opt"]:checked'); const idx=chosen?Number(chosen.value):0;
    addToCart(p, (p.options||[])[idx]||null); buyModal.classList.add('hidden');
  };
}

/* === Cart === */
function addToCart(p,opt){
  if(!opt){ alert('Brak wariantów dla tego produktu.'); return; }
  const idx=CART.findIndex(i=>i.id===p.id && i.option?.label===opt.label);
  if(idx>-1) CART[idx].qty+=1; else CART.push({id:p.id,title:p.title,option:{label:opt.label,price:Number(opt.price||0),link:opt.link||''},qty:1});
  saveCart();
}
function renderCart(){
  const box=qs('#cartList'); box.innerHTML='';
  if(!CART.length){ box.innerHTML='<p class="meta">Koszyk jest pusty.</p>'; return; }
  let sum=0;
  CART.forEach((i,k)=>{
    sum+=Number(i.option.price||0)*(i.qty||1);
    const row=document.createElement('div'); row.className='item';
    row.innerHTML=`
      <div>
        <div><b>${escapeHtml(i.title)}</b> — ${escapeHtml(i.option.label)}</div>
        <div class="meta">${Number(i.option.price||0).toFixed(2)} zł × 
          <button class="btn ghost" data-k="${k}" data-act="dec">−</button>
          <b>${i.qty}</b>
          <button class="btn ghost" data-k="${k}" data-act="inc">+</button>
        </div>
      </div>
      <div><button class="btn ghost" data-k="${k}" data-act="del">Usuń</button></div>`;
    row.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b) return; const K=Number(b.dataset.k), act=b.dataset.act;
      if(act==='inc') CART[K].qty++; if(act==='dec') CART[K].qty=Math.max(1,CART[K].qty-1); if(act==='del') CART.splice(K,1);
      saveCart(); renderCart();
    });
    box.appendChild(row);
  });
  const sumEl=document.createElement('div'); sumEl.style.textAlign='right'; sumEl.style.marginTop='8px'; sumEl.innerHTML=`<b>Razem: ${sum.toFixed(2)} zł</b>`;
  box.appendChild(sumEl);
}
async function checkout(){
  if(!token()){alert('Zaloguj się, aby kupić.');return;}
  if(!CART.length){alert('Koszyk jest pusty.');return;}
  try{
    const res=await API('/api/order',{method:'POST',body:JSON.stringify({items:CART,note:qs('#orderNote').value||""})});
    if(res.ok){ CART=[]; saveCart(); cartModal.classList.add('hidden'); alert('Zamówienie wysłane ✔'); }
    else alert('Błąd zamówienia.');
  }catch{ alert('Błąd sieci.'); }
}

/* === Admin: uploader === */
function setupUploader(){
  if(!imgDrop||!imgInput) return;
  const openPicker=()=>imgInput.click();
  imgDrop.addEventListener('click', openPicker);
  imgDrop.addEventListener('dragover',e=>{e.preventDefault(); imgDrop.classList.add('drag');});
  imgDrop.addEventListener('dragleave',()=>imgDrop.classList.remove('drag'));
  imgDrop.addEventListener('drop',e=>{
    e.preventDefault(); imgDrop.classList.remove('drag');
    const f=e.dataTransfer.files?.[0]; if(f) uploadFile(f);
  });
  imgInput.addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(f) uploadFile(f);
  });
}
async function uploadFile(file){
  if(!ME?.is_admin){ alert('Tylko admin może wgrywać obrazki.'); return; }
  if(!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)){ alert('Obsługiwane: PNG, JPG, WEBP, GIF.'); return; }
  if(file.size>10*1024*1024){ alert('Maks. 10 MB.'); return; }
  try{
    submitBtn.disabled=true; submitBtn.textContent='Wgrywam...';
    const fd=new FormData(); fd.append('file',file);
    const res=await API('/api/upload',{method:'POST',body:fd});
    if(res.ok && res.url){
      imageUrlInp.value=res.url;
      imgPreview.src=res.url; imgPreview.style.display='block';
      imgInner.querySelector('p').textContent='Wgrano obrazek';
    }else{
      alert('Nie udało się wgrać obrazka.');
    }
  }catch{ alert('Błąd sieci przy uploadzie.'); }
  finally{ submitBtn.disabled=false; submitBtn.textContent='Zapisz produkt'; }
}

/* === Admin: product form === */
function addOptionRow(data={label:'Standard', price:0, link:''}){
  const wrap=qs('#optionsWrap');
  const row=document.createElement('div');
  row.innerHTML=`
    <input placeholder="Nazwa wariantu" value="${escapeAttr(data.label||'Standard')}">
    <input type="number" step="0.01" placeholder="Cena" value="${Number(data.price||0)}">
    <input placeholder="Link docelowy (po Kup)" value="${escapeAttr(data.link||'')}">
    <button type="button" class="ghost">Usuń</button>`;
  row.querySelector('button').onclick=()=>row.remove();
  wrap.appendChild(row);
}
function loadProductToForm(p){
  adminPanel.classList.remove('hidden');
  const f=qs('#productForm');
  f.id.value=p.id||''; f.title.value=p.title||''; f.description.value=p.description||'';
  imageUrlInp.value=p.imageUrl||''; if(p.imageUrl){ imgPreview.src=p.imageUrl; imgPreview.style.display='block'; imgInner.querySelector('p').textContent='Wgrano obrazek'; }
  basePrice.value = p.options?.[0]?.price || 0;
  qs('#optionsWrap').innerHTML='';
  (p.options||[]).forEach(o=> addOptionRow(o));
}
async function submitProduct(e){
  e.preventDefault();
  if(!ME?.is_admin){ alert('Brak uprawnień (admin).'); return; }

  const f=e.target;
  const id=f.id.value.trim(), title=f.title.value.trim();
  if(!id || !title){ alert('Uzupełnij ID i Tytuł.'); return; }

  const options = [...qs('#optionsWrap').children].map(row=>{
    const [l,p,ln]=row.querySelectorAll('input');
    return {label:l.value.trim()||'Standard', price:Number(p.value||0), link:(ln.value||'').trim()};
  }).filter(o=>!isNaN(o.price));

  if(!options.length){
    const priceNum = Number(basePrice.value||0);
    if(isNaN(priceNum) || priceNum<0){ alert('Podaj poprawną cenę.'); return; }
    options.push({label:'Standard', price: priceNum, link:''});
  }

  const payload={
    id,
    title,
    description: f.description.value.trim(),
    imageUrl: imageUrlInp.value.trim(),
    options
  };

  try{
    submitBtn.disabled=true; submitBtn.textContent='Zapisuję...';
    const res=await API('/api/products',{method:'POST',body:JSON.stringify(payload)});
    if(res.ok){
      const list=await API('/api/products'); PRODUCTS=list.products||[]; renderProducts();
      alert('Zapisano produkt ✔');
    }else alert('Błąd zapisu produktu.');
  }catch{ alert('Błąd sieci przy zapisie.'); }
  finally{ submitBtn.disabled=false; submitBtn.textContent='Zapisz produkt'; }
}
async function delProduct(id){
  if(!ME?.is_admin){ alert('Brak uprawnień (admin).'); return; }
  if(!confirm('Usunąć ten produkt?')) return;
  try{
    const res=await API(`/api/products/${encodeURIComponent(id)}`,{method:'DELETE'});
    if(res.ok){ const list=await API('/api/products'); PRODUCTS=list.products||[]; renderProducts(); }
    else alert('Nie udało się usunąć.');
  }catch{ alert('Błąd sieci przy usuwaniu.'); }
}

/* === Utils === */
function escapeHtml(s=''){ return s.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function escapeAttr(s=''){ return s.replace(/"/g,'&quot;'); }
