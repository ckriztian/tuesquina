const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class MemoryStorage {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); this.failWrites = false; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { if (this.failWrites) { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; } this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function createStore(seed = {}) {
  const localStorage = new MemoryStorage(seed), errors = [];
  const context = { localStorage, structuredClone, console: { error() {} }, Date, Map, Set, Object, Array, JSON, Number, TypeError };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('storage.js', 'utf8'), context);
  context.TuEsquinaStorage.setErrorHandler((message, detail) => errors.push({ message, detail }));
  return { store: context.TuEsquinaStorage, localStorage, errors };
}

function completeData(marker = 'original') {
  return {
    products: [{ id: marker }], purchases: [{ id: marker }], sales: [{ id: marker }], costHistory: [{ id: marker }],
    suppliers: [{ id: marker }], cash: { marker }, settings: { marker }, promotions: [{ id: marker }], combos: [{ id: marker }],
    priceHistory: [{ id: marker }], commercialSettings: { marker }, movements: [{ id: marker }]
  };
}

test('backup completo contiene todas las colecciones y schemaVersion', () => {
  const { store } = createStore(), backup = store.createBackup(completeData());
  assert.equal(backup.schemaVersion, 1);
  assert.deepEqual(Object.keys(backup.data).sort(), store.DATA_KEYS.slice().sort());
  assert.equal(store.validateBackup(backup).ok, true);
});

test('restaurar actualiza persistencia y estado en memoria', () => {
  const { store, localStorage } = createStore(); let memory = completeData('changed');
  const result = store.restoreApplicationState(store.createBackup(completeData('restored')), data => { memory = data; });
  assert.equal(result.ok, true); assert.equal(memory.products[0].id, 'restored');
  assert.equal(JSON.parse(localStorage.getItem(store.KEYS.products))[0].id, 'restored');
});

test('JSON inválido no modifica datos existentes', () => {
  const { store, localStorage } = createStore({ untouched: 'value' });
  assert.equal(store.validateBackup('{invalid').ok, false);
  assert.equal(localStorage.getItem('untouched'), 'value');
});

test('schemaVersion futuro se rechaza', () => {
  const { store } = createStore(), backup = store.createBackup(completeData()); backup.schemaVersion = 99;
  assert.equal(store.validateBackup(backup).ok, false);
});

test('colección corrupta conserva el raw y no puede sobrescribirse', () => {
  const { store, localStorage } = createStore({ 'laEsquina.products': '{broken' });
  const result = store.safeRead(store.KEYS.products, [], { type: 'array' });
  assert.equal(result.corrupt, true); assert.equal(store.safeWrite(store.KEYS.products, []), false);
  assert.equal(localStorage.getItem(store.KEYS.products), '{broken');
  assert.equal(store.createEmergencyExport().issues[0].raw, '{broken');
});

test('promociones y combos sobreviven backup y restauración', () => {
  const { store } = createStore(); let restored;
  store.restoreApplicationState(store.createBackup(completeData('commercial')), data => { restored = data; });
  assert.equal(restored.promotions[0].id, 'commercial'); assert.equal(restored.combos[0].id, 'commercial');
});

test('historial de precios sobrevive restauración', () => {
  const { store } = createStore(); let restored;
  store.restoreApplicationState(store.createBackup(completeData('price')), data => { restored = data; });
  assert.equal(restored.priceHistory[0].id, 'price');
});

test('proveedores sobreviven restauración', () => {
  const { store } = createStore(); let restored;
  store.restoreApplicationState(store.createBackup(completeData('supplier')), data => { restored = data; });
  assert.equal(restored.suppliers[0].id, 'supplier');
});

test('caja sobrevive restauración', () => {
  const { store } = createStore(); let restored;
  store.restoreApplicationState(store.createBackup(completeData('cash')), data => { restored = data; });
  assert.equal(restored.cash.marker, 'cash');
});

test('error de cuota se informa y conserva la persistencia anterior', () => {
  const { store, localStorage, errors } = createStore({ 'laEsquina.products': '[{"id":"old"}]' });
  localStorage.failWrites = true;
  assert.equal(store.saveApplicationState(completeData('new')), false);
  localStorage.failWrites = false;
  assert.equal(JSON.parse(localStorage.getItem(store.KEYS.products))[0].id, 'old');
  assert.match(errors.at(-1).message, /espacio suficiente/);
});

test('vaciado elimina todos los módulos después de generar backup previo', () => {
  const { store, localStorage } = createStore(); const current = completeData('before');
  assert.equal(store.saveApplicationState(current), true);
  const preClear = store.createBackup(current); assert.equal(store.validateBackup(preClear).ok, true);
  const empty = Object.fromEntries(store.DATA_KEYS.map(field => [field, ['cash', 'settings', 'commercialSettings'].includes(field) ? {} : []]));
  assert.equal(store.clearApplicationData(empty), true);
  store.DATA_KEYS.forEach(field => assert.deepEqual(JSON.parse(localStorage.getItem(store.KEYS[field])), empty[field]));
});

test('backup parcial o con tipos incorrectos se rechaza', () => {
  const { store } = createStore(), missing = store.createBackup(completeData()); delete missing.data.suppliers;
  assert.equal(store.validateBackup(missing).ok, false);
  const wrong = store.createBackup(completeData()); wrong.data.cash = [];
  assert.equal(store.validateBackup(wrong).ok, false);
});
