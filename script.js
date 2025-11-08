// L'Oréal Routine Builder — script.js
// Loads products, allows selection, persists to localStorage, and sends requests to a Cloudflare Worker.
// NOTE: Your Cloudflare Worker URL is expected to handle requests and call OpenAI securely.

const APP = {
  products: [],
  filtered: [],
  selected: new Map(),
  chatHistory: [],
  workerUrl: window.__APP_CONFIG__.workerUrl,
  enableWebSearch: false
};

const el = (id)=>document.getElementById(id);

// --- Utilities ---
function saveSelected(){
  const arr = Array.from(APP.selected.keys());
  localStorage.setItem('selectedProducts', JSON.stringify(arr));
}
function loadSelected(){
  try{
    const raw = JSON.parse(localStorage.getItem('selectedProducts')||'[]');
    return new Set(raw);
  }catch(e){return new Set()}
}
function renderCategories(){
  const cats = new Set(APP.products.map(p=>p.category));
  const sel = el('categoryFilter');
  sel.innerHTML = '<option value="all">All Categories</option>';
  cats.forEach(c=>{
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

// --- Render grid ---
function renderGrid(){
  const grid = el('productGrid');
  grid.innerHTML = '';
  APP.filtered.forEach(prod=>{
    const card = document.createElement('div');
    card.className = 'product-card';
    card.tabIndex = 0;
    card.dataset.id = prod.id;

    if(APP.selected.has(prod.id)) card.classList.add('selected');

    card.innerHTML = `
      <div class="thumb" aria-hidden="true">${prod.brand[0]||'P'}</div>
      <div class="meta">
        <div class="brand-name">${prod.brand}</div>
        <div class="product-name">${prod.name}</div>
        <div class="product-desc-toggle" role="button" tabindex="0">Details</div>
      </div>
    `;

    // clicking toggles selection (but clicking 'Details' opens modal)
    card.addEventListener('click', (e)=>{
      if(e.target.classList.contains('product-desc-toggle')) return;
      toggleSelect(prod.id);
      renderGrid();
      renderSelectedList();
    });
    // keyboard accessibility
    card.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' ') {
        e.preventDefault();
        toggleSelect(prod.id);
        renderGrid();
        renderSelectedList();
      }
    });

    const detailsBtn = card.querySelector('.product-desc-toggle');
    detailsBtn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      showModal(prod);
    });
    grid.appendChild(card);
  });
}

// --- Selected list ---
function renderSelectedList(){
  const container = el('selectedList');
  container.innerHTML = '';
  if(APP.selected.size===0){
    container.innerHTML = '<div class="muted">No products selected.</div>';
    return;
  }
  APP.selected.forEach((v,k)=>{
    const item = document.createElement('div');
    item.className = 'selected-item';
    item.innerHTML = `
      <div class="meta">
        <div class="thumb" style="width:40px;height:40px;font-size:12px">${v.brand[0]||''}</div>
        <div><div style="font-weight:700">${v.brand}</div><div style="font-size:13px;color:#666">${v.name}</div></div>
      </div>
      <div>
        <button class="remove" data-id="${k}" title="Remove">Remove</button>
      </div>
    `;
    item.querySelector('.remove').addEventListener('click', ()=>{
      APP.selected.delete(k);
      saveSelected();
      renderGrid();
      renderSelectedList();
    });
    container.appendChild(item);
  });
}

// --- Modal for product details ---
function showModal(prod){
  const modal = el('modal');
  const body = el('modalBody');
  modal.setAttribute('aria-hidden','false');
  body.innerHTML = `
    <h3>${prod.brand} — ${prod.name}</h3>
    <p><strong>Category:</strong> ${prod.category}</p>
    <p>${prod.description}</p>
    <p><strong>Keywords:</strong> ${prod.keywords.join(', ')}</p>
  `;
}
function closeModal(){
  const modal = el('modal');
  modal.setAttribute('aria-hidden','true');
}

// --- Selection toggle ---
function toggleSelect(id){
  const p = APP.products.find(x=>x.id===id);
  if(!p) return;
  if(APP.selected.has(id)){
    APP.selected.delete(id);
  } else {
    APP.selected.set(id,p);
  }
  saveSelected();
}

// --- Search & filter ---
function applyFilters(){
  const q = el('searchInput').value.trim().toLowerCase();
  const cat = el('categoryFilter').value;
  APP.filtered = APP.products.filter(p=>{
    const matchesCat = (cat==='all') || p.category===cat;
    const hay = (p.name+' '+p.brand+' '+p.description+' '+(p.keywords||[]).join(' ')).toLowerCase();
    const matchesQ = !q || hay.includes(q);
    return matchesCat && matchesQ;
  });
  renderGrid();
}

// --- Chat / Routine generation ---
async function generateRoutine(){
  if(APP.selected.size===0){
    appendSystemMessage("Please select one or more products before generating a routine.");
    return;
  }
  const products = Array.from(APP.selected.values());
  appendUserMessage(`Generate a skincare routine using ${products.map(p=>p.name).join(', ')}`);
  // show loading
  appendAssistantMessage("Generating personalized routine…");

  try{
    const payload = {
      type: 'generate_routine',
      products,
      history: APP.chatHistory,
      webSearch: APP.enableWebSearch
    };
    const res = await fetch(APP.workerUrl+'/generate', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      throw new Error('Worker returned '+res.status);
    }
    const data = await res.json();
    // Expect data to be { text: "...", citations:[{title,url}], assistantMessage: "..."}
    // Remove the temporary "Generating..." bubble and append real content
    removeLastAssistantLoading();
    if(data.text) appendAssistantMessage(data.text, data.citations);
    else if(data.assistantMessage) appendAssistantMessage(data.assistantMessage, data.citations);
    else appendAssistantMessage("Sorry — no content returned from worker.");
    // push assistant reply to conversation history
    APP.chatHistory.push({role:'assistant',content:data.text||data.assistantMessage||''});
  }catch(err){
    removeLastAssistantLoading();
    appendAssistantMessage("Error generating routine: "+err.message);
  }
}

// --- Chat helpers ---
function appendUserMessage(text){
  APP.chatHistory.push({role:'user',content:text});
  const bubble = document.createElement('div'); bubble.className='chat-bubble user'; bubble.textContent = text;
  el('chatWindow').appendChild(bubble);
  el('chatWindow').scrollTop = el('chatWindow').scrollHeight;
}
function appendAssistantMessage(text, citations){
  const bubble = document.createElement('div'); bubble.className='chat-bubble assistant';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = text.replace(/\n/g,'<br>');
  bubble.appendChild(wrapper);
  if(citations && Array.isArray(citations) && citations.length){
    const citeWrap = document.createElement('div');
    citeWrap.style.marginTop='8px';
    citations.forEach(c=>{
      const a = document.createElement('a');
      a.href = c.url; a.target='_blank'; a.rel='noopener';
      a.textContent = c.title || c.url;
      citeWrap.appendChild(a);
      citeWrap.appendChild(document.createElement('br'));
    });
    bubble.appendChild(citeWrap);
  }
  el('chatWindow').appendChild(bubble);
  el('chatWindow').scrollTop = el('chatWindow').scrollHeight;
  APP.chatHistory.push({role:'assistant',content:text});
}
function appendSystemMessage(text){
  const bubble = document.createElement('div'); bubble.className='chat-bubble assistant';
  bubble.style.opacity = 0.9;
  bubble.textContent = text;
  el('chatWindow').appendChild(bubble);
  el('chatWindow').scrollTop = el('chatWindow').scrollHeight;
}
function removeLastAssistantLoading(){
  // optionally remove the last assistant placeholder "Generating..."
  const items = el('chatWindow').querySelectorAll('.chat-bubble.assistant');
  if(items.length){
    const last = items[items.length-1];
    if(last.textContent && last.textContent.includes('Generating')) last.remove();
  }
}

// --- Sending follow-up user message ---
async function sendFollowUp(question){
  if(!question) return;
  appendUserMessage(question);
  appendAssistantMessage("Thinking…");
  try{
    const payload = {
      type: 'follow_up',
      question,
      history: APP.chatHistory,
      products: Array.from(APP.selected.values()),
      webSearch: APP.enableWebSearch
    };
    const res = await fetch(APP.workerUrl+'/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('Worker returned '+res.status);
    const data = await res.json();
    removeLastAssistantLoading();
    if(data.text) appendAssistantMessage(data.text, data.citations);
    else appendAssistantMessage("No response from worker.");
  }catch(err){
    removeLastAssistantLoading();
    appendAssistantMessage("Error: "+err.message);
  }
}

// --- Init & event wiring ---
async function init(){
  // load products.json
  try{
    const resp = await fetch('products.json');
    APP.products = await resp.json();
  }catch(e){
    APP.products = [];
    console.error('Could not load products.json',e);
  }
  // restore selected from localStorage
  const set = loadSelected();
  APP.products.forEach(p=>{
    if(set.has(p.id)) APP.selected.set(p.id,p);
  });
  renderCategories();
  APP.filtered = [...APP.products];
  renderGrid();
  renderSelectedList();

  // events
  el('searchInput').addEventListener('input', applyFilters);
  el('categoryFilter').addEventListener('change', applyFilters);
  el('generateBtn').addEventListener('click', generateRoutine);
  el('clearBtn').addEventListener('click', ()=>{
    APP.selected.clear(); saveSelected(); renderGrid(); renderSelectedList();
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e)=>{ if(e.target.id==='modal') closeModal(); });

  // chat form
  document.getElementById('chatForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = el('chatInput').value.trim();
    if(!q) return;
    el('chatInput').value='';
    sendFollowUp(q);
  });

  // RTL toggle
  document.getElementById('rtlToggle').addEventListener('click', ()=>{
    const html = document.documentElement;
    if(html.getAttribute('dir')==='rtl') html.setAttribute('dir','ltr');
    else html.setAttribute('dir','rtl');
  });
}

window.addEventListener('DOMContentLoaded', init);
