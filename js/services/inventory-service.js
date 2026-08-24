(function initInventoryService(global) {
  'use strict';
  const TYPES = Object.freeze(['SALE', 'PURCHASE', 'ADJUSTMENT', 'RETURN', 'EXPIRATION', 'CORRECTION']);
  const fail = (code, message, details = {}) => ({ ok: false, code, message, details });
  const finite = value => Number.isFinite(Number(value));
  const replace = (target, snapshot) => { target.splice(0, target.length, ...snapshot); };

  function createMovement({ id, occurredAt, type, productId, quantityDelta, previousStock, resultingStock, sourceType, sourceId, reason, userId }) {
    if (!TYPES.includes(type)) throw new Error(`Tipo de movimiento inválido: ${type}`);
    return { id, occurredAt, type, productId, quantityDelta, previousStock, resultingStock, sourceType, sourceId, reason, userId: userId || 'Administrador' };
  }

  function adjustInventory(payload, context) {
    const { products, movements, persist, uid = crypto.randomUUID.bind(crypto), now = () => new Date().toISOString() } = context;
    const product = products.find(item => item.id === payload.productId);
    if (!product) return fail('PRODUCT_NOT_FOUND', 'El producto no existe.', { productId: payload.productId });
    if (!String(payload.reason || '').trim()) return fail('REASON_REQUIRED', 'Indicá el motivo del ajuste.');
    const previousStock = Number(product.stock);
    const delta = payload.newQuantity != null ? Number(payload.newQuantity) - previousStock : Number(payload.quantityDelta);
    if (!finite(previousStock) || !finite(delta)) return fail('INVALID_QUANTITY', 'La cantidad del ajuste no es válida.');
    const resultingStock = previousStock + delta;
    if (resultingStock < 0) return fail('NEGATIVE_STOCK', 'El ajuste dejaría stock negativo.', { previousStock, quantityDelta: delta });
    if (delta === 0) return { ok: true, product, movement: null, inventoryChange: null, warnings: ['El stock no cambió.'] };
    const movement = createMovement({ id: uid(), occurredAt: payload.occurredAt || now(), type: payload.type || 'ADJUSTMENT', productId: product.id,
      quantityDelta: delta, previousStock, resultingStock, sourceType: payload.origin || 'MANUAL', sourceId: payload.sourceId || null,
      reason: String(payload.reason).trim(), userId: payload.userId });
    const movementSnapshot = structuredClone(movements), oldStock = product.stock;
    product.stock = resultingStock; movements.unshift(movement);
    if (!persist()) { product.stock = oldStock; replace(movements, movementSnapshot); return fail('PERSISTENCE_FAILED', 'No se pudo guardar el ajuste; el stock fue restaurado.'); }
    return { ok: true, product, movement, inventoryChange: { productId: product.id, previousStock, resultingStock, quantityDelta: delta }, warnings: [] };
  }

  global.InventoryService = Object.freeze({ TYPES, createMovement, adjustInventory });
})(globalThis);
