# Auditoría previa — servicios de dominio

La interfaz concentraba las operaciones comerciales en `app.js`. Esta etapa conserva los formularios y renderizadores, pero mueve las mutaciones coordinadas a servicios sin dependencias del DOM.

| Operación actual | Ubicación anterior | Tratamiento |
| --- | --- | --- |
| Confirmar venta, validar stock, descontarlo y guardar | listener de `#completeSale` | Reemplazado por `SalesService.completeSale()`; la UI conserva mensajes y recibo. |
| Aplicar promociones | `bestPromotion()` y extensión de `saleTotals()` en `pricing.js` | Reutilizado mediante un callback inyectado al servicio; no se cambia el motor promocional. |
| Registrar compra, recalcular costo, lote e historial | listener de `#purchaseForm` | Reemplazado por `PurchaseService.registerPurchase()`. |
| Calcular costo promedio | `calculateAverageCost()` | Centralizado en `PurchaseService.calculateWeightedAverageCost()`. |
| Editar stock desde producto | listener de `#productForm` | Encapsulado mediante `InventoryService.adjustInventory()` cuando cambia un producto existente. |
| Abrir/cerrar caja y movimientos manuales | `handleCash()` | Reemplazado por `CashService.openCashSession()`, `closeCashSession()` y `registerCashMovement()`. |
| Guardar ventas, compras y caja | `save()` global | Reutilizado como callback único de persistencia segura para cada transacción lógica. |
| Ganancia histórica | `estimatedProfit()` consultaba el costo actual | Reemplazado por snapshots `costAtSale`/`estimatedProfit` guardados en cada ítem. |

`product.stock` continúa siendo el stock materializado. La nueva colección `movements` es un libro de auditoría complementario y no reconstruye todavía las existencias.

No se introduce todavía un `appState` sustituto: hacerlo en esta etapa obligaría a migrar simultáneamente todos los renderizadores y el módulo de precios. Los servicios reciben un contexto explícito con las colecciones existentes, lo que permite incorporar ese agregador gradualmente sin duplicar estado.
