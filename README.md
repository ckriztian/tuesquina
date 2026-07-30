# Tu Esquina — Gestión de kiosco

Aplicación web responsive de punto de venta, inventario, compras, vencimientos e historial, construida con HTML, CSS y JavaScript puro (sin frameworks ni build step).

## Ejecutar

Abrí `index.html` directamente en el navegador o iniciá un servidor local:

```bash
python3 -m http.server 8000
```

Los productos, ventas y compras se almacenan en `localStorage` del navegador bajo las claves `laEsquina.*`. Los registros existentes de versiones anteriores se migran automáticamente al esquema actual sin eliminar información.

## Novedades de esta versión

**Diseño**
- Identidad visual nueva: paleta verde bosque + dorado, tipografía Fraunces (títulos) + Inter (texto) + IBM Plex Mono (todas las cifras, como en un ticket de caja).
- Modo oscuro completo (claro / oscuro / según el sistema), con el interruptor en el pie de la barra lateral.
- Componentes rediseñados: tarjetas, tablas, filtros, diálogos y estados vacíos con un lenguaje visual más limpio y consistente.

**Funcionalidades nuevas**
- **Costo promedio ponderado**: cada compra combina el valor del stock anterior con el nuevo costo, sin usar ni modificar automáticamente el precio de venta.
- **Recomendación de precio**: panel posterior a la compra con recargos rápidos, precio manual, advertencias de margen y redondeo comercial configurable.
- **Migración de inventario**: los productos anteriores reciben de forma segura los campos separados `precioVenta`, `costoPromedio`, `ultimoCostoCompra`, `stockMinimo`, recargo y fecha de compra, conservando `price`/`minStock` por compatibilidad.
- **Historial de costos y precios**: cada compra guarda su trazabilidad en `laEsquina.costHistory` y se incluye en las copias de seguridad.
- **Paleta de comandos** (`Ctrl/Cmd + K` o `/`): buscá una sección o un producto y agregalo a la venta sin salir del teclado.
- **Recibo imprimible**: cada venta puede verse e imprimirse como comprobante desde el historial o justo después de cobrar.
- **Deshacer al eliminar**: borrar un producto muestra un aviso con la opción de restaurarlo durante unos segundos.
- **Gráfico de ventas de 7 días** y **sugerencias de reposición** (con acceso directo para registrar la compra) en el inicio.
- **Copias de seguridad**: exportar todos los datos a un archivo `.json` y restaurarlos luego (útil al cambiar de navegador o dispositivo).
- **Exportación a CSV** de inventario, compras y ventas desde Ajustes o desde la vista de Ventas.
- Panel de **Ajustes** (ícono ⚙ en la barra lateral) que agrupa apariencia, copias de seguridad, exportación y borrado de datos.

## Estructura

- `index.html` — estructura y diálogos de la aplicación.
- `styles.css` — sistema de diseño (tokens de color/tipografía, modo oscuro, layout responsive).
- `app.js` — lógica de datos, renderizado y funcionalidades.
