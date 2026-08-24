(function initPurchaseService(global) {
  'use strict';
  const fail = (code, message, details = {}) => ({ ok: false, code, message, details });
  const valid = value => Number.isFinite(Number(value));
  const replace = (target, snapshot) => { target.splice(0, target.length, ...snapshot); };

  function calculateWeightedAverageCost({ previousStock, previousAverageCost, purchasedQuantity, purchaseUnitCost }) {
    const stock = Number(previousStock), average = Number(previousAverageCost), quantity = Number(purchasedQuantity), cost = Number(purchaseUnitCost);
    if (![stock, average, quantity, cost].every(Number.isFinite) || stock < 0 || average < 0 || quantity <= 0 || cost <= 0) return NaN;
    if (stock === 0 || average === 0) return cost;
    const result = ((stock * average) + (quantity * cost)) / (stock + quantity);
    return Number.isFinite(result) ? result : NaN;
  }

  function priceReview(product, newAverage, previousLastCost, minimumMargin) {
    const price = Number(product.precioVenta ?? product.price ?? 0), reasons = [];
    if (!price) reasons.push('NO_PRICE');
    if (price > 0 && price < newAverage) reasons.push('BELOW_COST');
    if (Number(product.ultimoCostoCompra || 0) > Number(previousLastCost || 0)) reasons.push('COST_INCREASED');
    const margin = price > 0 ? (price - newAverage) / price * 100 : 0;
    if (price > 0 && margin < Number(minimumMargin || 0)) reasons.push('LOW_MARGIN');
    return { requiresPriceReview: reasons.length > 0, priceReviewReason: reasons.join(',') };
  }

  function registerPurchase(payload, context) {
    const { products, purchases, costHistory, movements, persist, uid = crypto.randomUUID.bind(crypto), now = () => new Date().toISOString(), minimumMargin = 20 } = context;
    const supplier = String(payload.supplier || '').trim();
    if (!supplier) return fail('SUPPLIER_REQUIRED', 'Seleccioná o ingresá un proveedor.');
    const items = payload.items?.length ? payload.items : [{ productId: payload.productId, quantity: payload.quantity, unitCost: payload.unitCost,
      expiration: payload.expiration, batch: payload.batch }];
    if (items.length !== 1) return fail('MULTIPLE_ITEMS_NOT_SUPPORTED', 'Esta versión admite un producto por compra.');
    const input = items[0], product = products.find(item => item.id === input.productId);
    if (!product) return fail('PRODUCT_NOT_FOUND', 'El producto seleccionado no existe.', { productId: input.productId });
    const quantity = Number(input.quantity), unitCost = Number(input.unitCost);
    if (!valid(quantity) || !Number.isInteger(quantity) || quantity <= 0) return fail('INVALID_QUANTITY', 'La cantidad debe ser un entero positivo.');
    if (!valid(unitCost) || unitCost <= 0) return fail('INVALID_COST', 'El costo debe ser mayor que cero.');
    const previousStock = Number(product.stock), previousAverageCost = Number(product.costoPromedio || 0), previousLastCost = Number(product.ultimoCostoCompra || 0);
    const averageCost = calculateWeightedAverageCost({ previousStock, previousAverageCost, purchasedQuantity: quantity, purchaseUnitCost: unitCost });
    if (!Number.isFinite(averageCost)) return fail('INVALID_AVERAGE_COST', 'No se pudo calcular el costo promedio.');
    const purchaseId = uid(), occurredAt = payload.occurredAt || now(), resultingStock = previousStock + quantity;
    const review = priceReview({ ...product, ultimoCostoCompra: unitCost }, averageCost, previousLastCost, minimumMargin);
    const purchaseItem = { productoId: product.id, productoIdLegacy: product.id, cantidad: quantity, costoUnitario: unitCost, subtotal: quantity * unitCost,
      costoPromedioAnterior: previousAverageCost, nuevoCostoPromedio: averageCost, precioVentaAnterior: product.precioVenta, precioVentaSugerido: payload.suggestedPrice,
      margenConfigurado: payload.percent, tipoCalculo: payload.calculation, tipoRedondeo: payload.rounding, fechaVencimiento: input.expiration || '', lote: input.batch || '' };
    const purchase = { id: purchaseId, fecha: payload.date, date: payload.date, proveedorId: payload.supplierId || null, nombreProveedor: supplier, supplier,
      productos: [purchaseItem], totalCompra: quantity * unitCost, productId: product.id, productName: product.name, brand: product.brand, quantity,
      content: product.content, unit: product.unit, unitCost, totalCost: quantity * unitCost, expiration: input.expiration || '', comprobante: payload.receipt || '',
      notes: payload.notes || '', ...purchaseItem };
    const historyEntry = { id: uid(), purchaseId, fecha: occurredAt, productoId: product.id, nombreProducto: product.name, presentacion: payload.presentation || '', proveedor: supplier,
      stockAnterior: previousStock, cantidadComprada: quantity, stockNuevo: resultingStock, costoPromedioAnterior: previousAverageCost, costoCompraNuevo: unitCost,
      costoPromedioNuevo: averageCost, precioVentaAnterior: product.precioVenta, precioVentaSugerido: payload.suggestedPrice, precioVentaAplicado: product.precioVenta,
      porcentaje: payload.percent, tipoCalculo: payload.calculation, tipoRedondeo: payload.rounding, usuario: payload.userId || 'Administrador', motivo: 'Compra registrada; precio pendiente de confirmación' };
    const movement = global.InventoryService.createMovement({ id: uid(), occurredAt, type: 'PURCHASE', productId: product.id, quantityDelta: quantity,
      previousStock, resultingStock, sourceType: 'PURCHASE', sourceId: purchaseId, reason: 'Compra registrada', userId: payload.userId });
    const snapshots = { product: structuredClone(product), purchases: structuredClone(purchases), costHistory: structuredClone(costHistory), movements: structuredClone(movements) };
    product.stock = resultingStock; product.ultimoCostoCompra = unitCost; product.costoPromedio = averageCost; product.fechaUltimaCompra = payload.date;
    product.fechaModificacion = occurredAt; product.requiereRevisionPrecio = review.requiresPriceReview;
    if (input.expiration) {
      product.batches ||= [];
      product.batches.push({ id: uid(), quantity, expiration: input.expiration, purchaseDate: payload.date, lote: input.batch || '', purchaseId, unitCost });
      if (!product.expiration || new Date(`${input.expiration}T00:00:00`) < new Date(`${product.expiration}T00:00:00`)) product.expiration = product.fechaVencimiento = input.expiration;
    }
    purchases.unshift(purchase); costHistory.unshift(historyEntry); movements.unshift(movement);
    if (!persist()) {
      Object.assign(product, snapshots.product); replace(purchases, snapshots.purchases); replace(costHistory, snapshots.costHistory); replace(movements, snapshots.movements);
      return fail('PERSISTENCE_FAILED', 'No se pudo guardar la compra; los cambios fueron revertidos.');
    }
    return { ok: true, purchase, historyEntry, movement, inventoryChange: { productId: product.id, previousStock, resultingStock, quantityDelta: quantity },
      averageCost, ...review, warnings: [] };
  }

  global.PurchaseService = Object.freeze({ calculateWeightedAverageCost, registerPurchase });
})(globalThis);
