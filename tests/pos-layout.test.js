const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const pricing = fs.readFileSync('pricing.js', 'utf8');

test('el carrito separa encabezado, productos, opciones y checkout', () => {
  const panel = html.slice(html.indexOf('<aside class="cart-panel">'), html.indexOf('</aside>', html.indexOf('<aside class="cart-panel">')));
  ['cart-title', 'cart-items', 'cart-summary', 'cart-subtotal', 'cart-options', 'cart-checkout', 'completeSale'].forEach(name => assert.match(panel, new RegExp(name)));
  assert.ok(panel.indexOf('cart-title') < panel.indexOf('cart-items'));
  assert.ok(panel.indexOf('cart-items') < panel.indexOf('cart-summary'));
  assert.ok(panel.indexOf('cart-options') < panel.indexOf('cart-checkout'));
});

test('la lista conserva altura útil y es el scroll principal', () => {
  assert.match(css, /\.cart-items\{[^}]*flex:1 1 auto;[^}]*min-height:160px;[^}]*overflow-x:hidden;[^}]*overflow-y:auto/);
  assert.match(css, /\.cart-items::-webkit-scrollbar\{width:9px\}/);
  assert.match(css, /\.cart-title\{[^}]*flex:0 0 auto/);
  assert.match(css, /\.cart-options\{flex:0 0 auto;min-height:0;overflow:visible\}/);
  assert.match(css, /\.cart-checkout\{flex:0 0 auto\}/);
});

test('pantallas angostas y de poca altura mantienen una salida accesible', () => {
  assert.match(css, /@media\(max-width:1150px\)[\s\S]*?\.cart-panel\{position:static;height:auto;min-height:0;max-height:none\}/);
  assert.match(css, /@media\(min-width:1151px\) and \(max-height:700px\)[\s\S]*?\.cart-panel\{position:static;top:auto;height:auto;min-height:0;max-height:none;overflow:visible\}/);
});

test('el resumen promocional permanece visible incluso cuando vale cero', () => {
  assert.match(pricing, /row\.hidden=false/);
});
