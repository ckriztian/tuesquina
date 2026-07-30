/* =========================================================================
   Tu Esquina — lógica de la aplicación
   Mantiene el mismo esquema de datos que las versiones anteriores
   (localStorage bajo las claves laEsquina.*), por lo que la información
   ya guardada en el navegador se conserva sin cambios.
   ========================================================================= */

const STORAGE = { products: 'laEsquina.products', purchases: 'laEsquina.purchases', sales: 'laEsquina.sales', theme: 'laEsquina.theme' };
const UNITS = ['Unidad', 'Gramos', 'Kilogramos', 'Mililitros', 'Litros'];

const seedProducts = [
  { id: 'p1', name: 'Agua mineral', brand: 'Villavicencio', category: 'Bebidas', price: 1500, stock: 24, minStock: 5, content: 500, unit: 'Mililitros', expiration: '' },
  { id: 'p2', name: 'Gaseosa cola', brand: 'Coca-Cola', category: 'Bebidas', price: 2800, stock: 15, minStock: 5, content: 1.5, unit: 'Litros', expiration: '' },
  { id: 'p3', name: 'Papas clásicas', brand: 'Lays', category: 'Snacks', price: 2300, stock: 8, minStock: 4, content: 85, unit: 'Gramos', expiration: '' },
  { id: 'p4', name: 'Chocolate', brand: 'Águila', category: 'Golosinas', price: 1900, stock: 4, minStock: 5, content: 100, unit: 'Gramos', expiration: '' },
  { id: 'p5', name: 'Galletitas Oreo', brand: 'Oreo', category: 'Almacén', price: 2100, stock: 11, minStock: 4, content: 118, unit: 'Gramos', expiration: '' },
  { id: 'p6', name: 'Arroz', brand: 'Gallo', category: 'Almacén', price: 2600, stock: 7, minStock: 3, content: 1, unit: 'Kilogramos', expiration: '' }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(number(value));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/* ---------------------------------------------------------------------
   Persistencia y migración: conserva las claves históricas y completa
   campos faltantes sin borrar información existente.
   --------------------------------------------------------------------- */
function load(key, fallback) {
  try { const parsed = JSON.parse(localStorage.getItem(key)); return Array.isArray(parsed) ? parsed : structuredClone(fallback); }
  catch { return structuredClone(fallback); }
}
function normalizeProduct(p) {
  return {
    id: p.id || uid(), name: String(p.name || 'Producto sin nombre'), brand: String(p.brand || 'Sin marca'),
    category: String(p.category || 'General'), code: String(p.code || ''), price: Math.max(0, number(p.price)),
    stock: Math.max(0, Math.floor(number(p.stock))), minStock: Math.max(0, Math.floor(number(p.minStock ?? 5))),
    content: Math.max(0, number(p.content)), unit: UNITS.includes(p.unit) ? p.unit : 'Unidad',
    expiration: p.expiration || '', batches: Array.isArray(p.batches) ? p.batches : []
  };
}
function normalizePurchase(p) {
  const cost = number(p.cost ?? p.totalCost);
  return { ...p, id: p.id || uid(), date: p.date || new Date().toISOString(), supplier: p.supplier || 'Sin proveedor', quantity: Math.max(0, number(p.quantity)), unitCost: number(p.unitCost) || (p.quantity ? cost / p.quantity : 0), totalCost: cost, expiration: p.expiration || '', notes: p.notes || '' };
}
function normalizeSale(s) {
  const subtotal = number(s.subtotal ?? s.total);
  return { ...s, id: s.id || uid(), date: s.date || new Date().toISOString(), items: Array.isArray(s.items) ? s.items : [], subtotal, adjustmentType: s.adjustmentType || 'none', adjustmentPercent: number(s.adjustmentPercent), adjustmentAmount: number(s.adjustmentAmount), shippingAmount: Math.max(0, number(s.shippingAmount)), total: number(s.total), paymentMethod: s.paymentMethod || 'No registrado' };
}

let products = load(STORAGE.products, seedProducts).map(normalizeProduct);
let purchases = load(STORAGE.purchases, []).map(normalizePurchase);
let sales = load(STORAGE.sales, []).map(normalizeSale);
let cart = [];
let catalogFilter = 'all', expirationFilter = 'all', bulkCandidates = [];
let lastDeleted = null;

function save() {
  localStorage.setItem(STORAGE.products, JSON.stringify(products));
  localStorage.setItem(STORAGE.purchases, JSON.stringify(purchases));
  localStorage.setItem(STORAGE.sales, JSON.stringify(sales));
}
save();

/* ---------------------------------------------------------------------
   Utilidades generales
   --------------------------------------------------------------------- */
function showToast(message, type = 'ok', actionLabel = '', actionFn = null, duration = 3200) {
  const toast = $('#toast');
  toast.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);
  if (actionLabel && actionFn) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { actionFn(); toast.classList.remove('show'); });
    toast.appendChild(btn);
  }
  toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
}

function presentation(p) { return p.content ? `${new Intl.NumberFormat('es-AR').format(p.content)} ${p.unit}` : p.unit; }
// Las fechas YYYY-MM-DD se crean a medianoche local para evitar corrimientos por zona horaria.
function localDate(value) { if (!value) return null; const [y, m, d] = value.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function today() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
function daysUntil(value) { const date = localDate(value); return date ? Math.round((date - today()) / 86400000) : null; }
function formatDate(value, withTime = false) { if (!value) return 'Sin fecha'; const date = value.includes?.('T') ? new Date(value) : localDate(value); return date.toLocaleString('es-AR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }); }
function expirationState(p) { const days = daysUntil(p.expiration); if (days === null) return 'none'; if (days < 0) return 'expired'; if (days <= 7) return 'urgent'; if (days <= 30) return 'soon'; return 'safe'; }
function stockState(p) { return p.stock === 0 ? 'empty' : p.stock <= p.minStock ? 'low' : 'ok'; }
function metric(label, value, detail = '', kind = '') { return `<div class="metric ${kind}"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`; }

/* ---------------------------------------------------------------------
   Tema (claro / oscuro / sistema)
   --------------------------------------------------------------------- */
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
function currentThemePref() { return localStorage.getItem(STORAGE.theme) || 'system'; }
function applyTheme(pref) {
  const isDark = pref === 'dark' || (pref === 'system' && systemDark.matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  $('#themeToggle').textContent = isDark ? '☾' : '☀';
  $$('.theme-option').forEach(btn => btn.classList.toggle('active', btn.dataset.themeOption === pref));
}
function setThemePref(pref) { localStorage.setItem(STORAGE.theme, pref); applyTheme(pref); }
systemDark.addEventListener('change', () => { if (currentThemePref() === 'system') applyTheme('system'); });
applyTheme(currentThemePref());

/* ---------------------------------------------------------------------
   Render: dashboard
   --------------------------------------------------------------------- */
function renderDashboard() {
  const expired = products.filter(p => expirationState(p) === 'expired').length;
  const soon = products.filter(p => ['urgent', 'soon'].includes(expirationState(p))).length;
  const low = products.filter(p => p.stock <= p.minStock).length;
  const todaySales = sales.filter(s => new Date(s.date).toDateString() === new Date().toDateString());

  $('#dashboardMetrics').innerHTML =
    metric('VENTAS DE HOY', money(todaySales.reduce((a, s) => a + s.total, 0)), `${todaySales.length} operaciones`) +
    metric('PRODUCTOS VENCIDOS', expired, 'Requieren atención', expired ? 'alert' : '') +
    metric('PRÓXIMOS A VENCER', soon, 'Dentro de 30 días', soon ? 'warning' : '') +
    metric('STOCK BAJO', low, 'En mínimo o sin stock', low ? 'warning' : '');

  const alerts = products.filter(p => expirationState(p) === 'expired' || p.stock <= p.minStock).slice(0, 5);
  $('#dashboardAlerts').innerHTML = alerts.length
    ? alerts.map(p => `<div class="alert-row"><span class="alert-dot ${expirationState(p) === 'expired' ? 'red' : ''}"></span><div><strong>${escapeHtml(p.name)}</strong><small>${expirationState(p) === 'expired' ? 'Producto vencido' : `Quedan ${p.stock} unidades`}</small></div><span class="badge ${expirationState(p) === 'expired' ? 'expired' : 'low'}">${expirationState(p) === 'expired' ? 'Vencido' : 'Stock bajo'}</span></div>`).join('')
    : '<div class="empty-state"><strong>Todo está en orden</strong><small>No hay alertas críticas.</small></div>';

  renderSalesChart();
  renderReorderSuggestions();
}

// Ventas de los últimos 7 días (incluye hoy) para el gráfico del dashboard.
function renderSalesChart() {
  const days = [...Array(7)].map((_, i) => { const d = today(); d.setDate(d.getDate() - (6 - i)); return d; });
  const totals = days.map(d => sales.filter(s => new Date(s.date).toDateString() === d.toDateString()).reduce((a, s) => a + s.total, 0));
  const max = Math.max(...totals, 1);
  $('#salesChart').innerHTML = days.map((d, i) => {
    const isToday = d.toDateString() === today().toDateString();
    const heightPct = Math.max(4, Math.round((totals[i] / max) * 100));
    const label = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
    return `<div class="chart-bar-col"><span class="val">${totals[i] ? money(totals[i]).replace(/\s?ARS|\s?\$\s?/, '$') : '—'}</span><div class="chart-bar ${isToday ? 'today' : ''}" style="height:${heightPct}%" title="${money(totals[i])}"></div><small>${label}</small></div>`;
  }).join('');
}

// Sugerencia simple de reposición: duplica el stock mínimo como objetivo de compra.
function renderReorderSuggestions() {
  const candidates = products.filter(p => p.stock <= p.minStock)
    .sort((a, b) => (a.stock - a.minStock) - (b.stock - b.minStock))
    .slice(0, 5);
  $('#reorderList').innerHTML = candidates.length
    ? candidates.map(p => {
      const suggested = Math.max(p.minStock * 2 - p.stock, p.minStock || 1, 1);
      return `<div class="reorder-row"><div><strong>${escapeHtml(p.name)}</strong><small>${p.stock} en stock · mínimo ${p.minStock}</small></div><span class="badge num">+${suggested}</span><button class="icon-button" data-reorder="${p.id}" data-reorder-qty="${suggested}" title="Registrar compra">⇩</button></div>`;
    }).join('')
    : '<div class="empty-state"><strong>Sin faltantes</strong><small>No hay productos por debajo del mínimo.</small></div>';
}

/* ---------------------------------------------------------------------
   Render: punto de venta
   --------------------------------------------------------------------- */
// Ranking calculado por unidades históricas vendidas; se actualiza tras cada venta.
function topProducts() {
  const totals = {};
  sales.forEach(s => s.items.forEach(i => totals[i.id] = (totals[i.id] || 0) + number(i.quantity)));
  return products.filter(p => p.stock > 0).sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0)).slice(0, 8);
}
function renderQuickSale() {
  $('#quickSaleGrid').innerHTML = topProducts().map(p => `<button class="quick-product" data-add="${p.id}"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.brand)} · ${escapeHtml(presentation(p))}</small><b>${money(p.price)}</b></button>`).join('') || '<small>No hay productos con stock.</small>';
}
function renderCatalog() {
  const q = $('#productSearch').value.trim().toLowerCase();
  const filtered = products.filter(p => (`${p.name} ${p.brand}`).toLowerCase().includes(q) && (catalogFilter === 'all' || catalogFilter === 'available' && p.stock > 0 || catalogFilter === 'low' && p.stock <= p.minStock));
  $('#productGrid').innerHTML = filtered.length
    ? filtered.map(p => `<button class="product-card" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}><span class="stock-pill ${p.stock <= p.minStock ? 'low' : ''}">${p.stock ? `${p.stock} DISP.` : 'SIN STOCK'}</span><span class="initial">${escapeHtml(p.name[0]?.toUpperCase() || '?')}</span><h3>${escapeHtml(p.name)}</h3><span class="product-meta">${escapeHtml(p.brand)} · ${escapeHtml(presentation(p))}</span><span class="price">${money(p.price)}</span></button>`).join('')
    : '<div class="empty-state"><span>⌕</span><strong>Sin resultados</strong><small>Probá con otra búsqueda.</small></div>';
}

// Bonificaciones restan y recargos suman sobre el subtotal; el envío se suma aparte y el total nunca puede ser negativo.
function saleTotals() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const type = $('#adjustmentType').value, percent = number($('#adjustmentPercent').value);
  const valid = percent >= 0 && Number.isFinite(percent) && (type !== 'discount' || percent <= 100);
  const signed = type === 'discount' ? -1 : type === 'surcharge' ? 1 : 0;
  const amount = valid ? subtotal * percent / 100 * signed : 0;
  const shippingEnabled = $('#shippingEnabled').checked;
  const shippingAmount = shippingEnabled ? Math.max(0, number($('#shippingAmount').value)) : 0;
  const shippingValid = !shippingEnabled || (Number.isFinite(number($('#shippingAmount').value)) && number($('#shippingAmount').value) >= 0);
  return { subtotal, type, percent, amount, shippingEnabled, shippingAmount, valid: valid && shippingValid, total: Math.max(0, subtotal + amount + shippingAmount) };
}

// Los pagos que no son en efectivo (tarjeta, QR, transferencia) requieren dejar constancia de un recargo o bonificación.
function paymentRequiresAdjustment() {
  const method = $('#paymentMethod').value;
  return Boolean(method) && method !== 'Efectivo';
}
function renderCart() {
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  $('#cartCount').textContent = `${count} ${count === 1 ? 'ITEM' : 'ITEMS'}`;
  $('#cartItems').innerHTML = cart.length
    ? cart.map(i => `<div class="cart-item"><div><h3>${escapeHtml(i.name)}</h3><small>${escapeHtml(i.brand)} · ${escapeHtml(i.presentation)} · ${money(i.price)} c/u</small><div class="quantity"><button data-minus="${i.id}">−</button><strong>${i.quantity}</strong><button data-plus="${i.id}">＋</button><button data-remove="${i.id}" aria-label="Eliminar">×</button></div></div><strong class="num">${money(i.price * i.quantity)}</strong></div>`).join('')
    : '<div class="empty-state"><span>◇</span><strong>Tu venta está vacía</strong><small>Tocá un producto para agregarlo.</small></div>';
  const t = saleTotals();
  $('#subtotal').textContent = money(t.subtotal);
  $('#adjustmentLabel').textContent = `${t.type === 'discount' ? 'Bonificación' : t.type === 'surcharge' ? 'Recargo' : 'Ajuste'} (${t.percent || 0}%)`;
  $('#adjustmentAmount').textContent = `${t.amount > 0 ? '+' : ''}${money(t.amount)}`;

  const shippingOn = $('#shippingEnabled').checked;
  $('#shippingAmountRow').hidden = !shippingOn;
  $('#shippingSummaryRow').hidden = !shippingOn;
  if (shippingOn) $('#shippingDisplay').textContent = money(t.shippingAmount);

  const requiresAdjustment = paymentRequiresAdjustment() && t.type === 'none';
  $('#adjustmentRow').classList.toggle('required', requiresAdjustment);
  $('#adjustmentNote').classList.toggle('show', requiresAdjustment);

  $('#total').textContent = money(t.total);
  $('#completeSale').disabled = !cart.length;
}
function addToCart(id) {
  const p = products.find(x => x.id === id), item = cart.find(x => x.id === id), qty = item?.quantity || 0;
  if (!p || qty >= p.stock) return showToast('No hay más unidades disponibles', 'error');
  if (item) item.quantity++; else cart.push({ id: p.id, name: p.name, brand: p.brand, presentation: presentation(p), price: p.price, quantity: 1 });
  renderCart();
}

/* ---------------------------------------------------------------------
   Render: inventario
   --------------------------------------------------------------------- */
function categories() { return [...new Set(products.map(p => p.category))].sort(); }
function populateFilters() {
  const current = $('#inventoryCategory').value;
  $('#inventoryCategory').innerHTML = '<option value="all">Todas las categorías</option>' + categories().map(c => `<option>${escapeHtml(c)}</option>`).join('');
  $('#inventoryCategory').value = [...$('#inventoryCategory').options].some(o => o.value === current) ? current : 'all';
  $('#bulkCategory').innerHTML = '<option value="all">Todos los productos</option>' + categories().map(c => `<option>${escapeHtml(c)}</option>`).join('');
}
function renderInventory() {
  const q = $('#inventorySearch').value.trim().toLowerCase(), cat = $('#inventoryCategory').value, status = $('#inventoryStatus').value;
  const filtered = products.filter(p => (`${p.name} ${p.brand}`).toLowerCase().includes(q) && (cat === 'all' || p.category === cat) && (status === 'all' || status === 'low' && stockState(p) === 'low' || status === 'empty' && p.stock === 0 || status === 'soon' && ['urgent', 'soon'].includes(expirationState(p)) || status === 'expired' && expirationState(p) === 'expired'));
  const units = products.reduce((s, p) => s + p.stock, 0), low = products.filter(p => p.stock <= p.minStock).length;
  $('#inventoryMetrics').innerHTML = metric('PRODUCTOS', products.length) + metric('UNIDADES EN STOCK', units) + metric('STOCK BAJO', low, '', low ? 'warning' : '');
  $('#inventoryCount').textContent = `${filtered.length} productos`;
  $('#inventoryTable').innerHTML = filtered.length
    ? filtered.map(p => {
      const exp = expirationState(p), expClass = exp === 'urgent' || exp === 'soon' ? 'soon' : exp;
      return `<tr><td><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.brand)} · ${escapeHtml(presentation(p))}${p.code ? ` · ${escapeHtml(p.code)}` : ''}</small></td><td>${escapeHtml(p.category)}</td><td><strong class="num">${money(p.price)}</strong></td><td><span class="badge ${p.stock <= p.minStock ? 'low' : ''}">${p.stock} / mín. ${p.minStock}</span></td><td><span class="badge ${expClass}">${formatDate(p.expiration)}</span></td><td><div class="table-actions"><button class="icon-button" data-edit="${p.id}" title="Editar">✎</button><button class="icon-button delete" data-delete="${p.id}" title="Eliminar">×</button></div></td></tr>`;
    }).join('')
    : '<tr><td colspan="6">No se encontraron productos.</td></tr>';
}

/* ---------------------------------------------------------------------
   Render: compras, vencimientos, ventas
   --------------------------------------------------------------------- */
function renderPurchases() {
  const total = purchases.reduce((s, p) => s + p.totalCost, 0), units = purchases.reduce((s, p) => s + p.quantity, 0);
  $('#purchaseMetrics').innerHTML = metric('COMPRAS REGISTRADAS', purchases.length) + metric('UNIDADES RECIBIDAS', units) + metric('INVERSIÓN TOTAL', money(total));
  $('#purchasesTable').innerHTML = purchases.length
    ? purchases.map(p => `<tr><td>${formatDate(p.date)}</td><td><strong>${escapeHtml(p.supplier)}</strong></td><td>${escapeHtml(p.productName)}<small>${escapeHtml(p.brand || 'Sin marca')} · ${escapeHtml(p.content ? `${p.content} ${p.unit}` : '')}</small></td><td>${formatDate(p.expiration)}</td><td><span class="badge">+${p.quantity}</span></td><td class="num">${money(p.totalCost)}<small>${money(p.unitCost)} c/u</small></td></tr>`).join('')
    : '<tr><td colspan="6">Todavía no hay compras registradas.</td></tr>';
}
function renderExpirations() {
  const items = products.filter(p => { const d = daysUntil(p.expiration); return expirationFilter === 'all' || expirationFilter === 'none' && d === null || expirationFilter === 'expired' && d < 0 || ['7', '15', '30'].includes(expirationFilter) && d >= 0 && d <= Number(expirationFilter); })
    .sort((a, b) => (daysUntil(a.expiration) ?? Infinity) - (daysUntil(b.expiration) ?? Infinity));
  $('#expirationGrid').innerHTML = items.length
    ? items.map(p => {
      const d = daysUntil(p.expiration), state = expirationState(p);
      const message = d === null ? 'Sin vencimiento registrado' : d < 0 ? `Venció hace ${Math.abs(d)} días` : d === 0 ? 'Vence hoy' : `Faltan ${d} días`;
      return `<article class="expiration-card ${state}"><span class="badge ${state === 'urgent' || state === 'soon' ? 'soon' : state}">${message}</span><h3>${escapeHtml(p.name)}</h3><span class="product-meta">${escapeHtml(p.brand)} · ${escapeHtml(presentation(p))}</span><p class="days">${formatDate(p.expiration)}</p><dl><div><dt>STOCK</dt><dd>${p.stock} unidades</dd></div><div><dt>CATEGORÍA</dt><dd>${escapeHtml(p.category)}</dd></div></dl></article>`;
    }).join('')
    : '<div class="empty-state"><strong>No hay productos en este estado</strong><small>Elegí otro filtro.</small></div>';
}
function renderSales() {
  const revenue = sales.reduce((s, v) => s + v.total, 0), units = sales.reduce((s, v) => s + v.items.reduce((a, i) => a + i.quantity, 0), 0);
  $('#salesMetrics').innerHTML = metric('VENTAS', sales.length) + metric('UNIDADES VENDIDAS', units) + metric('INGRESOS', money(revenue));
  $('#salesTable').innerHTML = sales.length
    ? sales.map(s => `<tr><td>${formatDate(s.date, true)}</td><td>${s.items.map(i => `${escapeHtml(i.name)} × ${i.quantity}`).join('<br>')}</td><td class="num">${money(s.subtotal)}</td><td>${s.adjustmentType === 'none' ? 'Sin ajuste' : `${s.adjustmentType === 'discount' ? 'Bonificación' : 'Recargo'} ${s.adjustmentPercent}%`}<small>${money(s.adjustmentAmount)}</small></td><td><strong class="num">${money(s.total)}</strong>${s.shippingAmount ? `<small>Incluye envío ${money(s.shippingAmount)}</small>` : ''}</td><td><span class="badge">${escapeHtml(s.paymentMethod)}</span></td><td><button class="icon-button" data-receipt="${s.id}" title="Ver recibo">🖶</button></td></tr>`).join('')
    : '<tr><td colspan="7">Todavía no hay ventas registradas.</td></tr>';
}
function populateProductSelect() {
  const selected = $('#purchaseProduct').value;
  $('#purchaseProduct').innerHTML = '<option value="">Seleccionar…</option>' + products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} — ${escapeHtml(p.brand)}</option>`).join('');
  $('#purchaseProduct').value = selected;
  syncPurchaseProduct();
}
function renderAll() { populateFilters(); renderDashboard(); renderQuickSale(); renderCatalog(); renderCart(); renderInventory(); renderPurchases(); renderExpirations(); renderSales(); populateProductSelect(); }

/* ---------------------------------------------------------------------
   Diálogos: producto / navegación
   --------------------------------------------------------------------- */
function openProductDialog(product) {
  $('#productForm').reset();
  $('#productId').value = product?.id || '';
  $('#productDialogTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
  if (product) {
    $('#productName').value = product.name; $('#productBrand').value = product.brand; $('#productCategory').value = product.category;
    $('#productCode').value = product.code; $('#productPrice').value = product.price; $('#productStock').value = product.stock;
    $('#productMinStock').value = product.minStock; $('#productContent').value = product.content || ''; $('#productUnit').value = product.unit;
    $('#productExpiration').value = product.expiration;
  } else { $('#productMinStock').value = 5; $('#productStock').value = 0; }
  $('#productDialog').showModal();
}
function switchView(view) {
  $$('.nav-item,.view').forEach(el => el.classList.remove('active'));
  $(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  $(`#${view}-view`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------------------------------------------------
   Delegación global de clics
   --------------------------------------------------------------------- */
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]');
  if (nav) { event.preventDefault(); switchView(nav.dataset.view); }

  const add = event.target.closest('[data-add]');
  if (add) addToCart(add.dataset.add);

  const plus = event.target.closest('[data-plus]'), minus = event.target.closest('[data-minus]'), remove = event.target.closest('[data-remove]');
  if (plus) addToCart(plus.dataset.plus);
  if (minus) { const item = cart.find(i => i.id === minus.dataset.minus); if (item && --item.quantity === 0) cart = cart.filter(i => i.id !== item.id); renderCart(); }
  if (remove) { cart = cart.filter(i => i.id !== remove.dataset.remove); renderCart(); }

  const edit = event.target.closest('[data-edit]');
  if (edit) openProductDialog(products.find(p => p.id === edit.dataset.edit));

  const del = event.target.closest('[data-delete]');
  if (del) deleteProduct(del.dataset.delete);

  const reorder = event.target.closest('[data-reorder]');
  if (reorder) openPurchaseDialog(reorder.dataset.reorder, number(reorder.dataset.reorderQty));

  const receipt = event.target.closest('[data-receipt]');
  if (receipt) openReceipt(sales.find(s => s.id === receipt.dataset.receipt));

  const close = event.target.closest('[data-close]');
  if (close) $(`#${close.dataset.close}`).close();
});

// Borrado con posibilidad de deshacer: el producto se quita de inmediato,
// pero se puede restaurar durante unos segundos desde el aviso.
function deleteProduct(id) {
  const index = products.findIndex(p => p.id === id);
  if (index === -1) return;
  const [removed] = products.splice(index, 1);
  cart = cart.filter(i => i.id !== id);
  lastDeleted = { product: removed, index };
  save(); renderAll();
  showToast('Producto eliminado', 'ok', 'Deshacer', () => {
    if (!lastDeleted) return;
    products.splice(Math.min(lastDeleted.index, products.length), 0, lastDeleted.product);
    lastDeleted = null; save(); renderAll(); showToast('Producto restaurado');
  }, 5000);
}

$$('#stockFilters .filter').forEach(b => b.addEventListener('click', () => { $$('#stockFilters .filter').forEach(x => x.classList.remove('active')); b.classList.add('active'); catalogFilter = b.dataset.filter; renderCatalog(); }));
$$('#expirationFilters .filter').forEach(b => b.addEventListener('click', () => { $$('#expirationFilters .filter').forEach(x => x.classList.remove('active')); b.classList.add('active'); expirationFilter = b.dataset.expiration; renderExpirations(); }));
$('#productSearch').addEventListener('input', renderCatalog);
$('#inventorySearch').addEventListener('input', renderInventory);
$('#inventoryCategory').addEventListener('change', renderInventory);
$('#inventoryStatus').addEventListener('change', renderInventory);
$('#adjustmentType').addEventListener('change', renderCart);
$('#adjustmentPercent').addEventListener('input', renderCart);
$('#paymentMethod').addEventListener('change', renderCart);
$('#shippingEnabled').addEventListener('change', renderCart);
$('#shippingAmount').addEventListener('input', renderCart);
$('#clearSale').addEventListener('click', () => { cart = []; renderCart(); showToast('Venta vaciada'); });

$('#completeSale').addEventListener('click', () => {
  if (!cart.length) return showToast('Agregá productos antes de cobrar', 'error');
  if (!$('#paymentMethod').value) return showToast('Seleccioná un método de pago', 'error');
  const totals = saleTotals();
  if (!totals.valid) return showToast('Revisá el porcentaje de ajuste o el monto de envío', 'error');
  if (paymentRequiresAdjustment() && totals.type === 'none') return showToast('Este medio de pago requiere una bonificación o un recargo', 'error');
  if (cart.some(i => i.quantity > products.find(p => p.id === i.id).stock)) return showToast('El stock cambió. Revisá la venta.', 'error');
  /* El stock se descuenta sólo tras todas las validaciones. */
  cart.forEach(i => products.find(p => p.id === i.id).stock -= i.quantity);
  const sale = { id: uid(), date: new Date().toISOString(), items: structuredClone(cart), subtotal: totals.subtotal, adjustmentType: totals.type, adjustmentPercent: totals.percent, adjustmentAmount: totals.amount, shippingAmount: totals.shippingAmount, total: totals.total, paymentMethod: $('#paymentMethod').value };
  sales.unshift(sale);
  cart = []; $('#paymentMethod').value = ''; $('#adjustmentType').value = 'none'; $('#adjustmentPercent').value = 0;
  $('#shippingEnabled').checked = false; $('#shippingAmount').value = 0;
  save(); renderAll();
  showToast('Venta cobrada e inventario actualizado', 'ok', 'Ver recibo', () => openReceipt(sale), 4500);
});

$('#addProduct').addEventListener('click', () => openProductDialog());
$('#dashboardAddProduct').addEventListener('click', () => openProductDialog());
$('#productForm').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('#productId').value, name = $('#productName').value.trim(), price = number($('#productPrice').value), stock = number($('#productStock').value), minStock = number($('#productMinStock').value);
  if (!name || price < 0 || stock < 0 || minStock < 0 || ![price, stock, minStock].every(Number.isFinite)) return showToast('Revisá nombre, precio y stock', 'error');
  const duplicate = products.find(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase() && p.brand.toLowerCase() === ($('#productBrand').value.trim() || 'Sin marca').toLowerCase() && presentation(p) === presentation({ content: number($('#productContent').value), unit: $('#productUnit').value }));
  if (duplicate && !confirm('Ya existe un producto con el mismo nombre, marca y presentación. ¿Guardar de todos modos?')) return;
  const data = normalizeProduct({ id: id || uid(), name, brand: $('#productBrand').value.trim() || 'Sin marca', category: $('#productCategory').value.trim() || 'General', code: $('#productCode').value.trim(), price, stock, minStock, content: number($('#productContent').value), unit: $('#productUnit').value, expiration: $('#productExpiration').value, batches: id ? products.find(p => p.id === id)?.batches : [] });
  if (id) Object.assign(products.find(p => p.id === id), data); else products.push(data);
  save(); renderAll(); $('#productDialog').close();
  showToast(id ? 'Producto actualizado' : 'Producto agregado');
});

/* ---------------------------------------------------------------------
   Compras
   --------------------------------------------------------------------- */
function syncPurchaseProduct() {
  const p = products.find(x => x.id === $('#purchaseProduct').value);
  $('#purchaseBrand').value = p?.brand || '';
  if (p) { $('#purchaseContent').value = p.content || ''; $('#purchaseUnit').value = p.unit; }
}
function calcPurchaseTotal() { $('#purchaseTotalCost').value = (number($('#purchaseQuantity').value) * number($('#purchaseUnitCost').value)).toFixed(2); }
function openPurchaseDialog(productId = '', quantity = '') {
  if (!products.length) return openProductDialog();
  $('#purchaseForm').reset();
  populateProductSelect();
  $('#purchaseDate').value = new Date().toLocaleDateString('en-CA');
  if (productId) { $('#purchaseProduct').value = productId; syncPurchaseProduct(); }
  if (quantity) { $('#purchaseQuantity').value = quantity; calcPurchaseTotal(); }
  $('#purchaseDialog').showModal();
}
$('#newPurchase').addEventListener('click', () => openPurchaseDialog());
$('#purchaseProduct').addEventListener('change', syncPurchaseProduct);
$('#purchaseQuantity').addEventListener('input', calcPurchaseTotal);
$('#purchaseUnitCost').addEventListener('input', calcPurchaseTotal);
$('#createFromPurchase').addEventListener('click', () => { $('#purchaseDialog').close(); openProductDialog(); showToast('Creá el producto y luego registrá la compra'); });
$('#purchaseForm').addEventListener('submit', event => {
  event.preventDefault();
  const product = products.find(p => p.id === $('#purchaseProduct').value), quantity = number($('#purchaseQuantity').value), unitCost = number($('#purchaseUnitCost').value);
  if (!product || quantity <= 0 || !Number.isInteger(quantity) || unitCost < 0) return showToast('Revisá producto, cantidad y costo', 'error');
  const expiration = $('#purchaseExpiration').value;
  /* Una compra actualiza el producto existente y conserva el lote para trazabilidad. */
  product.stock += quantity;
  if (expiration) { product.batches.push({ id: uid(), quantity, expiration, purchaseDate: $('#purchaseDate').value }); if (!product.expiration || localDate(expiration) < localDate(product.expiration)) product.expiration = expiration; }
  product.brand = $('#purchaseBrand').value.trim() || product.brand;
  product.content = number($('#purchaseContent').value) || product.content;
  product.unit = $('#purchaseUnit').value;
  purchases.unshift({ id: uid(), date: $('#purchaseDate').value, supplier: $('#supplierName').value.trim(), productId: product.id, productName: product.name, brand: product.brand, quantity, content: product.content, unit: product.unit, unitCost, totalCost: quantity * unitCost, expiration, notes: $('#purchaseNotes').value.trim() });
  save(); renderAll(); $('#purchaseDialog').close();
  showToast('Compra registrada y stock actualizado');
});

/* ---------------------------------------------------------------------
   Actualización masiva de precios (vista previa en memoria)
   --------------------------------------------------------------------- */
$('#bulkPrices').addEventListener('click', () => { $('#bulkForm').reset(); bulkCandidates = []; $('#bulkPreview').innerHTML = '<p class="form-note">Completá los datos para ver los nuevos precios. Nada cambiará hasta confirmar.</p>'; $('#confirmBulk').disabled = true; populateFilters(); $('#bulkDialog').showModal(); });
$('#previewBulk').addEventListener('click', () => {
  const percent = number($('#bulkPercent').value), operation = $('#bulkOperation').value, category = $('#bulkCategory').value;
  if (percent <= 0 || !Number.isFinite(percent) || (operation === 'decrease' && percent > 100)) return showToast('Ingresá un porcentaje válido', 'error');
  const factor = operation === 'increase' ? 1 + percent / 100 : 1 - percent / 100;
  bulkCandidates = products.filter(p => category === 'all' || p.category === category).map(p => ({ id: p.id, name: p.name, old: p.price, next: Math.max(0, Math.round(p.price * factor * 100) / 100) }));
  if (!bulkCandidates.length) return showToast('No hay productos en esa categoría', 'error');
  $('#bulkPreview').innerHTML = `<table><thead><tr><th>Producto</th><th>Actual</th><th>Nuevo</th><th>Diferencia</th></tr></thead><tbody>${bulkCandidates.map(x => `<tr><td>${escapeHtml(x.name)}</td><td>${money(x.old)}</td><td><strong>${money(x.next)}</strong></td><td>${money(x.next - x.old)}</td></tr>`).join('')}</tbody></table>`;
  $('#confirmBulk').disabled = false;
});
$('#bulkForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!bulkCandidates.length) return;
  bulkCandidates.forEach(change => products.find(p => p.id === change.id).price = change.next);
  save(); renderAll(); $('#bulkDialog').close();
  showToast(`Se actualizaron ${bulkCandidates.length} precios`);
  bulkCandidates = [];
});

/* ---------------------------------------------------------------------
   Recibo imprimible
   --------------------------------------------------------------------- */
function openReceipt(sale) {
  if (!sale) return;
  const html = `
    <div class="receipt-head"><strong>TU ESQUINA</strong><small>${formatDate(sale.date, true)}</small><small>Comprobante no fiscal</small></div>
    ${sale.items.map(i => `<div class="receipt-row"><span>${escapeHtml(i.name)} × ${i.quantity}</span><span>${money(i.price * i.quantity)}</span></div>`).join('')}
    <div class="receipt-row" style="margin-top:8px"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    ${sale.adjustmentType !== 'none' ? `<div class="receipt-row"><span>${sale.adjustmentType === 'discount' ? 'Bonificación' : 'Recargo'} (${sale.adjustmentPercent}%)</span><span>${sale.adjustmentAmount > 0 ? '+' : ''}${money(sale.adjustmentAmount)}</span></div>` : ''}
    ${sale.shippingAmount ? `<div class="receipt-row"><span>Envío</span><span>${money(sale.shippingAmount)}</span></div>` : ''}
    <div class="receipt-row receipt-total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    <div class="receipt-row" style="margin-top:8px"><span>Pago</span><span>${escapeHtml(sale.paymentMethod)}</span></div>
    <div class="receipt-foot">¡Gracias por tu compra!</div>`;
  $('#receiptContent').innerHTML = html;
  $('#receiptDialog').showModal();
}
$('#printReceipt').addEventListener('click', () => window.print());

/* ---------------------------------------------------------------------
   Ajustes: tema, copias de seguridad y exportación
   --------------------------------------------------------------------- */
$('#openSettings').addEventListener('click', () => $('#settingsDialog').showModal());
$('#themeToggle').addEventListener('click', () => setThemePref(currentThemePref() === 'dark' ? 'light' : 'dark'));
$$('.theme-option').forEach(btn => btn.addEventListener('click', () => setThemePref(btn.dataset.themeOption)));

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function toCsv(rows, headers) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\r\n');
}
function stamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

$('#exportBackup').addEventListener('click', () => {
  const backup = { app: 'Tu Esquina', exportedAt: new Date().toISOString(), products, purchases, sales };
  downloadFile(`tu-esquina-backup-${stamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  showToast('Copia de seguridad descargada');
});
$('#importBackup').addEventListener('click', () => $('#importBackupFile').click());
$('#importBackupFile').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.products) || !Array.isArray(data.purchases) || !Array.isArray(data.sales)) throw new Error('formato inválido');
      if (!confirm('Esto reemplaza todos los productos, compras y ventas actuales por los del archivo. ¿Continuar?')) return;
      products = data.products.map(normalizeProduct);
      purchases = data.purchases.map(normalizePurchase);
      sales = data.sales.map(normalizeSale);
      save(); renderAll(); $('#settingsDialog').close();
      showToast('Copia de seguridad restaurada');
    } catch { showToast('El archivo no es una copia de seguridad válida', 'error'); }
    finally { event.target.value = ''; }
  };
  reader.readAsText(file);
});

$('#exportProductsCsv').addEventListener('click', () => {
  downloadFile(`inventario-${stamp()}.csv`, toCsv(products.map(p => ({ ...p, presentacion: presentation(p), vencimiento: formatDate(p.expiration) })), ['name', 'brand', 'category', 'code', 'price', 'stock', 'minStock', 'presentacion', 'vencimiento']), 'text/csv');
  showToast('Inventario exportado');
});
$('#exportPurchasesCsv').addEventListener('click', () => {
  downloadFile(`compras-${stamp()}.csv`, toCsv(purchases.map(p => ({ ...p, fecha: formatDate(p.date) })), ['fecha', 'supplier', 'productName', 'brand', 'quantity', 'unitCost', 'totalCost', 'expiration']), 'text/csv');
  showToast('Compras exportadas');
});
function exportSalesCsv() {
  const rows = sales.map(s => ({ fecha: formatDate(s.date, true), productos: s.items.map(i => `${i.name} x${i.quantity}`).join(' | '), subtotal: s.subtotal, ajuste: s.adjustmentAmount, envio: s.shippingAmount, total: s.total, pago: s.paymentMethod }));
  downloadFile(`ventas-${stamp()}.csv`, toCsv(rows, ['fecha', 'productos', 'subtotal', 'ajuste', 'envio', 'total', 'pago']), 'text/csv');
  showToast('Ventas exportadas');
}
$('#exportSalesCsv').addEventListener('click', exportSalesCsv);
$('#exportSalesCsv2').addEventListener('click', exportSalesCsv);

$('#clearAllData').addEventListener('click', () => {
  if (!confirm('Se borrarán todos los productos, compras y ventas guardados en este navegador. Esta acción no se puede deshacer. ¿Continuar?')) return;
  products = structuredClone(seedProducts).map(normalizeProduct);
  purchases = []; sales = []; cart = [];
  save(); renderAll(); $('#settingsDialog').close();
  showToast('Los datos se restablecieron');
});

/* ---------------------------------------------------------------------
   Paleta de comandos (Ctrl/Cmd + K)
   --------------------------------------------------------------------- */
const viewCommands = [
  { icon: '⌂', label: 'Inicio', hint: 'Resumen del negocio', view: 'dashboard' },
  { icon: '▦', label: 'Vender', hint: 'Punto de venta', view: 'pos' },
  { icon: '□', label: 'Inventario', hint: 'Productos y stock', view: 'inventory' },
  { icon: '⇩', label: 'Compras', hint: 'Registrar mercadería', view: 'purchases' },
  { icon: '◷', label: 'Vencimientos', hint: 'Control de lotes', view: 'expirations' },
  { icon: '≡', label: 'Ventas', hint: 'Historial', view: 'sales' }
];
let commandIndex = 0, commandItems = [];

function openCommandPalette() { $('#commandInput').value = ''; renderCommandResults(''); $('#commandDialog').showModal(); requestAnimationFrame(() => $('#commandInput').focus()); }
function renderCommandResults(query) {
  const q = query.trim().toLowerCase();
  const views = viewCommands.filter(c => !q || c.label.toLowerCase().includes(q));
  const prods = q ? products.filter(p => (`${p.name} ${p.brand}`).toLowerCase().includes(q)).slice(0, 6) : [];
  commandItems = [
    ...views.map(c => ({ type: 'view', ...c })),
    ...prods.map(p => ({ type: 'product', icon: '＋', label: p.name, hint: `${p.brand} · ${money(p.price)} · ${p.stock} en stock`, id: p.id }))
  ];
  commandIndex = 0;
  if (!commandItems.length) { $('#commandResults').innerHTML = '<div class="command-empty">Sin resultados. Probá con otro texto.</div>'; return; }
  const groupHtml = (label, items) => items.length ? `<div class="command-group-label">${label}</div>${items.map((item, i) => commandRowHtml(item, commandItems.indexOf(item))).join('')}` : '';
  $('#commandResults').innerHTML = groupHtml('Ir a', commandItems.filter(c => c.type === 'view')) + groupHtml('Agregar a la venta', commandItems.filter(c => c.type === 'product'));
  highlightCommand();
}
function commandRowHtml(item, index) {
  return `<button type="button" class="command-row" data-command-index="${index}"><span class="cmd-icon">${item.icon}</span><span><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.hint || '')}</small></span></button>`;
}
function highlightCommand() { $$('.command-row').forEach(row => row.classList.toggle('highlight', Number(row.dataset.commandIndex) === commandIndex)); $(`.command-row[data-command-index="${commandIndex}"]`)?.scrollIntoView({ block: 'nearest' }); }
function runCommand(item) {
  if (!item) return;
  $('#commandDialog').close();
  if (item.type === 'view') switchView(item.view);
  else if (item.type === 'product') { switchView('pos'); addToCart(item.id); }
}
$('#openCommand').addEventListener('click', openCommandPalette);
$('#commandInput').addEventListener('input', event => renderCommandResults(event.target.value));
$('#commandResults').addEventListener('click', event => { const row = event.target.closest('.command-row'); if (row) runCommand(commandItems[Number(row.dataset.commandIndex)]); });
$('#commandInput').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); commandIndex = Math.min(commandIndex + 1, commandItems.length - 1); highlightCommand(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); commandIndex = Math.max(commandIndex - 1, 0); highlightCommand(); }
  else if (event.key === 'Enter') { event.preventDefault(); runCommand(commandItems[commandIndex]); }
});
document.addEventListener('keydown', event => {
  const isTypingField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); }
  else if (event.key === '/' && !isTypingField) { event.preventDefault(); openCommandPalette(); }
});

/* ---------------------------------------------------------------------
   Reloj y arranque
   --------------------------------------------------------------------- */
function updateTime() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  $('#currentDate').textContent = now.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}
updateTime();
setInterval(updateTime, 1000);
renderAll();
