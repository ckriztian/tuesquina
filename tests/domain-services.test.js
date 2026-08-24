const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function services() {
  const context = { structuredClone, console, Date, Number, Object, Array, JSON, Math, crypto: require('node:crypto').webcrypto };
  context.globalThis = context;
  ['inventory-service.js', 'purchase-service.js', 'cash-service.js', 'sales-service.js'].forEach(file =>
    vm.runInNewContext(fs.readFileSync(`js/services/${file}`, 'utf8'), context));
  return context;
}
function ids() { let value = 0; return () => `id-${++value}`; }
function product(overrides = {}) { return { id: 'p1', name: 'Producto', brand: 'Marca', content: 1, unit: 'Unidad', stock: 10, costoPromedio: 1000, ultimoCostoCompra: 1000, precioVenta: 1500, price: 1500, batches: [], ...overrides }; }
function baseState(overrides = {}) { return { products: [product()], sales: [], purchases: [], costHistory: [], movements: [], promotions: [], cash: { open: false, movements: [], sessions: [] }, ...overrides }; }

test('venta normal descuenta stock, crea snapshot y movimiento', () => {
  const s = services(), state = baseState(), result = s.SalesService.completeSale({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'Transferencia' },
    { ...state, persist: () => true, uid: ids() });
  assert.equal(result.ok, true); assert.equal(state.products[0].stock, 8); assert.equal(state.sales.length, 1);
  assert.equal(result.sale.items[0].costAtSale, 1000); assert.equal(result.sale.items[0].estimatedProfit, 1000);
  assert.deepEqual({ type: state.movements[0].type, delta: state.movements[0].quantityDelta, before: state.movements[0].previousStock, after: state.movements[0].resultingStock }, { type: 'SALE', delta: -2, before: 10, after: 8 });
});

test('venta rechaza stock insuficiente y producto inexistente', () => {
  const s = services(), state = baseState(), context = { ...state, persist: () => true, uid: ids() };
  assert.equal(s.SalesService.completeSale({ items: [{ productId: 'p1', quantity: 11 }], paymentMethod: 'Efectivo' }, context).code, 'INSUFFICIENT_STOCK');
  assert.equal(s.SalesService.completeSale({ items: [{ productId: 'missing', quantity: 1 }], paymentMethod: 'Efectivo' }, context).code, 'PRODUCT_NOT_FOUND');
  assert.equal(state.products[0].stock, 10);
});

test('rentabilidad histórica conserva el costo al vender después de una compra', () => {
  const s = services(), state = baseState({ products: [product({ costoPromedio: 2000, ultimoCostoCompra: 2000, precioVenta: 3000, price: 3000 })] }), uid = ids();
  const sale = s.SalesService.completeSale({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'Transferencia' }, { ...state, persist: () => true, uid }).sale;
  s.PurchaseService.registerPurchase({ supplier: 'Proveedor', productId: 'p1', quantity: 1, unitCost: 2500, date: '2026-08-24' }, { ...state, persist: () => true, uid, minimumMargin: 20 });
  assert.equal(sale.items[0].estimatedProfit, 1000); assert.equal(s.SalesService.historicalProfit(sale), 1000);
});

test('venta vincula caja y solo informa cambio físico para efectivo', () => {
  const s = services(), uid = ids(), state = baseState();
  s.CashService.openCashSession({ openingCash: 10000 }, { cash: state.cash, persist: () => true, uid });
  const cashSale = s.SalesService.completeSale({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'Efectivo' }, { ...state, persist: () => true, uid });
  state.products[0].stock = 10;
  const transfer = s.SalesService.completeSale({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'Transferencia' }, { ...state, persist: () => true, uid });
  assert.equal(cashSale.sale.cashSessionId, state.cash.activeSession.id); assert.equal(cashSale.cashChange.amount, 1500); assert.equal(transfer.cashChange.amount, 0);
});

test('primera compra usa costo nuevo y compra posterior pondera stock', () => {
  const s = services(), uid = ids(), first = baseState({ products: [product({ stock: 0, costoPromedio: 0, ultimoCostoCompra: 0 })] });
  const result = s.PurchaseService.registerPurchase({ supplier: 'Mayorista', productId: 'p1', quantity: 5, unitCost: 2000, date: '2026-08-24' }, { ...first, persist: () => true, uid, minimumMargin: 20 });
  assert.equal(result.averageCost, 2000); assert.equal(first.products[0].stock, 5); assert.equal(first.purchases.length, 1); assert.equal(first.costHistory.length, 1); assert.equal(first.movements[0].type, 'PURCHASE');
  const weighted = s.PurchaseService.calculateWeightedAverageCost({ previousStock: 5, previousAverageCost: 2000, purchasedQuantity: 5, purchaseUnitCost: 3000 });
  assert.equal(weighted, 2500);
});

test('compra marca revisión cuando aumenta costo o baja margen', () => {
  const s = services(), state = baseState(), result = s.PurchaseService.registerPurchase({ supplier: 'Mayorista', productId: 'p1', quantity: 2, unitCost: 1400, date: '2026-08-24' },
    { ...state, persist: () => true, uid: ids(), minimumMargin: 20 });
  assert.equal(result.requiresPriceReview, true); assert.match(result.priceReviewReason, /COST_INCREASED|LOW_MARGIN/);
});

test('costo promedio rechaza entradas inválidas', () => {
  const { PurchaseService } = services();
  assert.equal(Number.isNaN(PurchaseService.calculateWeightedAverageCost({ previousStock: -1, previousAverageCost: 1, purchasedQuantity: 1, purchaseUnitCost: 1 })), true);
  assert.equal(Number.isNaN(PurchaseService.calculateWeightedAverageCost({ previousStock: 1, previousAverageCost: 1, purchasedQuantity: 0, purchaseUnitCost: 1 })), true);
});

test('ajustes positivos y negativos generan movimiento y exigen motivo', () => {
  const s = services(), state = baseState(), context = { products: state.products, movements: state.movements, persist: () => true, uid: ids() };
  assert.equal(s.InventoryService.adjustInventory({ productId: 'p1', quantityDelta: 2, reason: 'Conteo físico' }, context).movement.quantityDelta, 2);
  assert.equal(s.InventoryService.adjustInventory({ productId: 'p1', quantityDelta: -3, reason: 'Merma' }, context).movement.quantityDelta, -3);
  assert.equal(state.products[0].stock, 9);
  assert.equal(s.InventoryService.adjustInventory({ productId: 'p1', quantityDelta: 1, reason: '' }, context).code, 'REASON_REQUIRED');
  assert.equal(s.InventoryService.adjustInventory({ productId: 'p1', quantityDelta: -20, reason: 'Error' }, context).code, 'NEGATIVE_STOCK');
});

test('caja impide doble apertura', () => {
  const s = services(), cash = {}, context = { cash, persist: () => true, uid: ids() };
  assert.equal(s.CashService.openCashSession({ openingCash: 100 }, context).ok, true);
  assert.equal(s.CashService.openCashSession({ openingCash: 100 }, context).code, 'CASH_ALREADY_OPEN');
});

test('caja adapta una sesión histórica abierta sin destruir movimientos', () => {
  const { CashService } = services(), cash = { open: true, opening: 1000, openedAt: '2026-08-24T08:00:00.000Z', movements: [{ id: 'm1', date: '2026-08-24T09:00:00.000Z', amount: -200, note: 'Compra menor' }], sessions: [] };
  CashService.ensureCashState(cash);
  assert.equal(cash.activeSession.status, 'OPEN'); assert.equal(cash.activeSession.openingCash, 1000);
  assert.deepEqual({ type: cash.activeSession.movements[0].type, amount: cash.activeSession.movements[0].amount }, { type: 'EXPENSE', amount: 200 });
});

test('caja calcula efectivo esperado y diferencia sin pagos electrónicos', () => {
  const s = services(), cash = {}, sales = [], uid = ids(), context = { cash, persist: () => true, uid };
  const opened = s.CashService.openCashSession({ openingCash: 10000 }, context).session;
  sales.push({ cashSessionId: opened.id, paymentMethod: 'Efectivo', total: 5000 }, { cashSessionId: opened.id, paymentMethod: 'Transferencia', total: 8000 }, { cashSessionId: opened.id, paymentMethod: 'Tarjeta de débito', total: 3000 });
  assert.equal(s.CashService.registerCashMovement({ type: 'INCOME', amount: 2000, reason: 'Cambio' }, context).ok, true);
  assert.equal(s.CashService.registerCashMovement({ type: 'EXPENSE', amount: 1000, reason: 'Pago' }, context).ok, true);
  const closed = s.CashService.closeCashSession({ countedCash: 15500 }, { cash, sales, persist: () => true });
  assert.equal(closed.expectedCash, 16000); assert.equal(closed.difference, -500); assert.equal(closed.session.status, 'CLOSED');
});

test('servicios revierten mutaciones si falla persistencia', () => {
  const s = services(), state = baseState(), result = s.SalesService.completeSale({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'Efectivo' },
    { ...state, persist: () => false, uid: ids() });
  assert.equal(result.code, 'PERSISTENCE_FAILED'); assert.equal(state.products[0].stock, 10); assert.equal(state.sales.length, 0); assert.equal(state.movements.length, 0);
});
