(function initSalesService(global) {
  'use strict';
  const fail = (code, message, details = {}) => ({ ok: false, code, message, details });
  const replace = (target, snapshot) => { target.splice(0, target.length, ...snapshot); };

  function historicalProfit(sale) {
    if (Number.isFinite(Number(sale.estimatedProfit))) return Number(sale.estimatedProfit);
    return (sale.items || []).reduce((sum, item) => {
      if (Number.isFinite(Number(item.estimatedProfit ?? item.gananciaEstimada))) return sum + Number(item.estimatedProfit ?? item.gananciaEstimada);
      const cost = Number(item.costAtSale ?? item.costoPromedioAlVender ?? 0), applied = Number(item.appliedUnitPrice ?? item.precioAplicado ?? item.price ?? 0);
      return sum + (applied - cost) * Number(item.quantity ?? item.cantidad ?? 0);
    }, 0);
  }

  function completeSale(payload, context) {
    const { products, sales, movements, cash, promotions = [], persist, resolvePromotion, uid = crypto.randomUUID.bind(crypto), now = () => new Date().toISOString() } = context;
    if (!Array.isArray(payload.items) || !payload.items.length) return fail('EMPTY_CART', 'Agregá productos antes de cobrar.');
    if (!payload.paymentMethod) return fail('PAYMENT_METHOD_REQUIRED', 'Seleccioná un método de pago.');
    const resolved = [];
    for (const input of payload.items) {
      const product = products.find(item => item.id === input.productId);
      if (!product) return fail('PRODUCT_NOT_FOUND', 'Uno de los productos ya no existe.', { productId: input.productId });
      const quantity = Number(input.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) return fail('INVALID_QUANTITY', 'Las cantidades deben ser enteros positivos.', { productId: product.id });
      if (quantity > Number(product.stock)) return fail('INSUFFICIENT_STOCK', `No hay stock suficiente de ${product.name}.`, { productId: product.id, requested: quantity, available: product.stock });
      const promotion = resolvePromotion?.(product, quantity, payload.paymentMethod) || null;
      const normalUnitPrice = Number(product.precioVenta ?? product.price ?? 0), calc = promotion?.calculation;
      resolved.push({ product, quantity, promotion, normalUnitPrice, appliedUnitPrice: calc ? Number(calc.unit) : normalUnitPrice,
        normalLineTotal: normalUnitPrice * quantity, appliedLineTotal: calc ? Number(calc.total) : normalUnitPrice * quantity,
        commercialDiscount: calc ? Number(calc.discount) : 0 });
    }
    const normalSubtotal = resolved.reduce((sum, item) => sum + item.normalLineTotal, 0), subtotal = resolved.reduce((sum, item) => sum + item.appliedLineTotal, 0);
    const type = payload.adjustmentType || 'none', percent = Number(payload.adjustmentPercent || 0);
    if (!Number.isFinite(percent) || percent < 0 || (type === 'discount' && percent > 100) || !['none', 'discount', 'surcharge'].includes(type)) return fail('INVALID_ADJUSTMENT', 'El ajuste financiero no es válido.');
    const sign = type === 'discount' ? -1 : type === 'surcharge' ? 1 : 0, adjustmentAmount = subtotal * percent / 100 * sign;
    const shippingAmount = Math.max(0, Number(payload.shippingAmount || 0)), total = Math.max(0, subtotal + adjustmentAmount + shippingAmount), occurredAt = payload.occurredAt || now(), saleId = uid();
    const saleItems = resolved.map(item => {
      const financialShare = subtotal ? adjustmentAmount * item.appliedLineTotal / subtotal : 0, costAtSale = Number(item.product.costoPromedio || 0);
      const estimatedProfit = item.appliedLineTotal + financialShare - costAtSale * item.quantity;
      return { id: item.product.id, productId: item.product.id, productoId: item.product.id, name: item.product.name, productName: item.product.name,
        brand: item.product.brand, presentation: payload.presentProduct?.(item.product) || inputPresentation(item.product), quantity: item.quantity, cantidad: item.quantity,
        normalUnitPrice: item.normalUnitPrice, precioNormal: item.normalUnitPrice, appliedUnitPrice: item.appliedUnitPrice, precioAplicado: item.appliedUnitPrice,
        price: item.normalUnitPrice, costAtSale, costoPromedioAlVender: costAtSale, promotion: item.promotion ? { id: item.promotion.id, name: item.promotion.nombre } : null,
        promocionId: item.promotion?.id || null, promocionNombre: item.promotion?.nombre || '', commercialDiscount: item.commercialDiscount,
        descuentoPromocional: item.commercialDiscount, financialAdjustment: financialShare, estimatedProfit, gananciaEstimada: estimatedProfit, soldAt: occurredAt };
    });
    const activeSession = global.CashService.ensureCashState(cash).activeSession;
    const sale = { id: saleId, date: occurredAt, soldAt: occurredAt, items: saleItems, subtotalNormal: normalSubtotal, descuentosPromocionales: normalSubtotal - subtotal,
      subtotal, adjustmentType: type, adjustmentPercent: percent, adjustmentAmount, bonificacionFinanciera: adjustmentAmount < 0 ? Math.abs(adjustmentAmount) : 0,
      recargoFinanciero: adjustmentAmount > 0 ? adjustmentAmount : 0, shippingAmount, total, paymentMethod: payload.paymentMethod, metodoPago: payload.paymentMethod,
      cashSessionId: activeSession?.id || null, estimatedProfit: saleItems.reduce((sum, item) => sum + item.estimatedProfit, 0) };
    const snapshots = { products: structuredClone(products), sales: structuredClone(sales), movements: structuredClone(movements), promotions: structuredClone(promotions) };
    const inventoryChanges = [];
    resolved.forEach(item => {
      const previousStock = Number(item.product.stock), resultingStock = previousStock - item.quantity;
      item.product.stock = resultingStock; inventoryChanges.push({ productId: item.product.id, previousStock, resultingStock, quantityDelta: -item.quantity });
      movements.unshift(global.InventoryService.createMovement({ id: uid(), occurredAt, type: 'SALE', productId: item.product.id, quantityDelta: -item.quantity,
        previousStock, resultingStock, sourceType: 'SALE', sourceId: saleId, reason: 'Venta registrada', userId: payload.userId }));
      if (item.promotion) { const stored = promotions.find(promo => promo.id === item.promotion.id); if (stored) stored.unidadesAplicadas = Number(stored.unidadesAplicadas || 0) + item.quantity; }
    });
    sales.unshift(sale);
    if (!persist()) {
      replace(products, snapshots.products); replace(sales, snapshots.sales); replace(movements, snapshots.movements); replace(promotions, snapshots.promotions);
      return fail('PERSISTENCE_FAILED', 'No se pudo guardar la venta; los cambios fueron revertidos.');
    }
    return { ok: true, sale, inventoryChanges, movements: movements.slice(0, inventoryChanges.length),
      cashChange: { sessionId: sale.cashSessionId, amount: payload.paymentMethod === 'Efectivo' ? total : 0 }, warnings: [] };
  }

  function inputPresentation(product) { return product.presentation || `${product.content || 1} ${product.unit || 'Unidad'}`; }
  global.SalesService = Object.freeze({ completeSale, historicalProfit });
})(globalThis);
