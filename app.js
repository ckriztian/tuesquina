const STORAGE = { products: 'laEsquina.products', purchases: 'laEsquina.purchases', sales: 'laEsquina.sales' };
const seedProducts = [
  { id: 'p1', name: 'Agua mineral', price: 1.50, stock: 24 }, { id: 'p2', name: 'Gaseosa cola', price: 2.80, stock: 15 },
  { id: 'p3', name: 'Papas clásicas', price: 2.30, stock: 8 }, { id: 'p4', name: 'Chocolate', price: 1.90, stock: 4 },
  { id: 'p5', name: 'Galletas dulces', price: 2.10, stock: 11 }, { id: 'p6', name: 'Jugo de naranja', price: 2.60, stock: 7 },
  { id: 'p7', name: 'Caramelos', price: .50, stock: 32 }, { id: 'p8', name: 'Barra de cereal', price: 1.70, stock: 0 }
];

let products = load(STORAGE.products, seedProducts), purchases = load(STORAGE.purchases, []), sales = load(STORAGE.sales, []), cart = [];
let catalogFilter = 'all';
const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(value);
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function load(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; } }
function save() { localStorage.setItem(STORAGE.products, JSON.stringify(products)); localStorage.setItem(STORAGE.purchases, JSON.stringify(purchases)); localStorage.setItem(STORAGE.sales, JSON.stringify(sales)); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600); }

function renderCatalog() {
  const query = $('#productSearch').value.trim().toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(query) && (catalogFilter === 'all' || catalogFilter === 'available' && p.stock > 0 || catalogFilter === 'low' && p.stock <= 5));
  $('#productGrid').innerHTML = filtered.length ? filtered.map(p => `<button class="product-card" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}><span class="stock-pill ${p.stock <= 5 ? 'low':''}">${p.stock ? `${p.stock} DISP.` : 'SIN STOCK'}</span><span class="initial">${escapeHtml(p.name.charAt(0).toUpperCase())}</span><h3>${escapeHtml(p.name)}</h3><span class="price">${money(p.price)}</span></button>`).join('') : '<div class="empty-state"><span>⌕</span><strong>Sin resultados</strong><small>Prueba con otra búsqueda.</small></div>';
}
function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0), total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  $('#cartCount').textContent = `${count} ${count === 1 ? 'ITEM' : 'ITEMS'}`;
  $('#cartItems').innerHTML = cart.length ? cart.map(item => `<div class="cart-item"><div><h3>${escapeHtml(item.name)}</h3><small>${money(item.price)} c/u</small><div class="quantity"><button data-minus="${item.id}" aria-label="Quitar uno">−</button><strong>${item.quantity}</strong><button data-plus="${item.id}" aria-label="Agregar uno">＋</button><button data-remove="${item.id}" aria-label="Eliminar">×</button></div></div><strong>${money(item.price * item.quantity)}</strong></div>`).join('') : '<div class="empty-state"><span>◇</span><strong>Tu venta está vacía</strong><small>Toca un producto para agregarlo.</small></div>';
  $('#subtotal').textContent = $('#total').textContent = money(total); $('#completeSale').disabled = !cart.length;
}
function addToCart(id) { const product = products.find(p => p.id === id), item = cart.find(i => i.id === id); const qty = item?.quantity || 0; if (!product || qty >= product.stock) return showToast('No hay más unidades disponibles'); if (item) item.quantity++; else cart.push({ id, name: product.name, price: product.price, quantity: 1 }); renderCart(); }

function renderInventory() {
  const query = $('#inventorySearch').value.trim().toLowerCase(), filtered = products.filter(p => p.name.toLowerCase().includes(query));
  const units = products.reduce((s,p)=>s+p.stock,0), value=products.reduce((s,p)=>s+p.stock*p.price,0), low=products.filter(p=>p.stock<=5).length;
  $('#inventoryMetrics').innerHTML = metric('PRODUCTOS', products.length) + metric('UNIDADES EN STOCK', units) + metric('VALOR DE VENTA', money(value));
  $('#inventoryCount').textContent = `${filtered.length} productos · ${low} con stock bajo`;
  $('#inventoryTable').innerHTML = filtered.length ? filtered.map(p=>`<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${money(p.price)}</td><td><span class="badge ${p.stock<=5?'low':''}">${p.stock} unidades</span></td><td>${money(p.stock*p.price)}</td><td><div class="table-actions"><button class="icon-button" data-edit="${p.id}" title="Editar">✎</button><button class="icon-button delete" data-delete="${p.id}" title="Eliminar">×</button></div></td></tr>`).join('') : '<tr><td colspan="5">No se encontraron productos.</td></tr>';
}
function metric(label, value) { return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`; }
function renderPurchases() {
  const total = purchases.reduce((s,p)=>s+p.cost,0), units=purchases.reduce((s,p)=>s+p.quantity,0);
  $('#purchaseMetrics').innerHTML=metric('COMPRAS REGISTRADAS',purchases.length)+metric('UNIDADES RECIBIDAS',units)+metric('INVERSIÓN TOTAL',money(total));
  $('#purchasesTable').innerHTML=purchases.length?purchases.map(p=>`<tr><td>${new Date(p.date).toLocaleDateString('es-AR')}</td><td><strong>${escapeHtml(p.supplier)}</strong></td><td>${escapeHtml(p.productName)}</td><td><span class="badge">+${p.quantity} unidades</span></td><td>${money(p.cost)}</td></tr>`).join(''):'<tr><td colspan="5">Todavía no hay compras registradas.</td></tr>';
}
function populateProductSelect(){ $('#purchaseProduct').innerHTML=products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} — stock ${p.stock}</option>`).join(''); }
function renderAll(){ renderCatalog(); renderCart(); renderInventory(); renderPurchases(); populateProductSelect(); }

document.addEventListener('click', event => {
  const nav=event.target.closest('[data-view]'); if(nav){ document.querySelectorAll('.nav-item,.view').forEach(el=>el.classList.remove('active')); nav.classList.add('active'); $(`#${nav.dataset.view}-view`).classList.add('active'); }
  const add=event.target.closest('[data-add]'); if(add) addToCart(add.dataset.add);
  const plus=event.target.closest('[data-plus]'), minus=event.target.closest('[data-minus]'), remove=event.target.closest('[data-remove]');
  if(plus)addToCart(plus.dataset.plus); if(minus){const item=cart.find(i=>i.id===minus.dataset.minus); if(item&&--item.quantity===0)cart=cart.filter(i=>i.id!==item.id);renderCart();} if(remove){cart=cart.filter(i=>i.id!==remove.dataset.remove);renderCart();}
  const edit=event.target.closest('[data-edit]'); if(edit) openProductDialog(products.find(p=>p.id===edit.dataset.edit));
  const del=event.target.closest('[data-delete]'); if(del && confirm('¿Eliminar este producto del catálogo?')){products=products.filter(p=>p.id!==del.dataset.delete);cart=cart.filter(i=>i.id!==del.dataset.delete);save();renderAll();showToast('Producto eliminado');}
  const close=event.target.closest('[data-close]'); if(close) $(`#${close.dataset.close}`).close();
});
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));button.classList.add('active');catalogFilter=button.dataset.filter;renderCatalog();}));
$('#productSearch').addEventListener('input',renderCatalog); $('#inventorySearch').addEventListener('input',renderInventory);
$('#clearSale').addEventListener('click',()=>{cart=[];renderCart();showToast('Venta vaciada');});
$('#completeSale').addEventListener('click',()=>{cart.forEach(item=>products.find(p=>p.id===item.id).stock-=item.quantity);sales.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),total:cart.reduce((s,i)=>s+i.price*i.quantity,0),items:cart});cart=[];save();renderAll();showToast('Venta cobrada e inventario actualizado');});
function openProductDialog(product){$('#productForm').reset();$('#productId').value=product?.id||'';$('#productDialogTitle').textContent=product?'Editar producto':'Nuevo producto';if(product){$('#productName').value=product.name;$('#productPrice').value=product.price;$('#productStock').value=product.stock;}$('#productDialog').showModal();}
$('#addProduct').addEventListener('click',()=>openProductDialog());
$('#productForm').addEventListener('submit',event=>{event.preventDefault();const data={name:$('#productName').value.trim(),price:Number($('#productPrice').value),stock:Number($('#productStock').value)};const id=$('#productId').value;if(id)Object.assign(products.find(p=>p.id===id),data);else products.push({id:crypto.randomUUID(),...data});save();renderAll();$('#productDialog').close();showToast(id?'Producto actualizado':'Producto agregado');});
$('#newPurchase').addEventListener('click',()=>{if(!products.length)return showToast('Primero agrega un producto');populateProductSelect();$('#purchaseForm').reset();$('#purchaseDialog').showModal();});
$('#purchaseForm').addEventListener('submit',event=>{event.preventDefault();const product=products.find(p=>p.id===$('#purchaseProduct').value),quantity=Number($('#purchaseQuantity').value);product.stock+=quantity;purchases.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),supplier:$('#supplierName').value.trim(),productId:product.id,productName:product.name,quantity,cost:Number($('#purchaseCost').value)});save();renderAll();$('#purchaseDialog').close();showToast('Compra registrada y stock actualizado');});
function updateTime(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});$('#currentDate').textContent=now.toLocaleDateString('es-AR',{day:'2-digit',month:'short'});}
updateTime();setInterval(updateTime,1000);renderAll();
