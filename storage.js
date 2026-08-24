(function initDataIntegrity(global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const APP_NAME = 'Tu Esquina';
  const KEYS = Object.freeze({
    schemaVersion: 'laEsquina.schemaVersion', products: 'laEsquina.products', purchases: 'laEsquina.purchases',
    sales: 'laEsquina.sales', costHistory: 'laEsquina.costHistory', suppliers: 'laEsquina.suppliers',
    cash: 'laEsquina.cash', settings: 'laEsquina.settings', promotions: 'laEsquina.promotions',
    combos: 'laEsquina.combos', priceHistory: 'laEsquina.priceHistory', commercialSettings: 'laEsquina.commercialSettings',
    movements: 'laEsquina.movements', theme: 'laEsquina.theme'
  });
  const DATA_KEYS = Object.freeze(Object.keys(KEYS).filter(name => !['schemaVersion', 'theme'].includes(name)));
  const ARRAY_FIELDS = new Set(['products', 'purchases', 'sales', 'costHistory', 'suppliers', 'promotions', 'combos', 'priceHistory', 'movements']);
  const OBJECT_FIELDS = new Set(['cash', 'settings', 'commercialSettings']);
  const corrupt = new Map();
  let errorHandler = null;

  function clone(value) { return value == null ? value : structuredClone(value); }
  function expectedType(field) { return ARRAY_FIELDS.has(field) ? 'array' : OBJECT_FIELDS.has(field) ? 'object' : null; }
  function matchesType(value, type) { return type === 'array' ? Array.isArray(value) : type === 'object' ? Boolean(value) && typeof value === 'object' && !Array.isArray(value) : true; }
  function report(message, detail) { if (errorHandler) errorHandler(message, detail); else console.error(message, detail || ''); }
  function isQuotaError(error) { return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014; }

  function safeRead(key, fallback, options = {}) {
    const raw = global.localStorage.getItem(key);
    if (raw === null) return { ok: true, missing: true, value: clone(fallback), raw: null };
    try {
      const value = options.raw ? raw : JSON.parse(raw);
      if (!matchesType(value, options.type)) throw new TypeError(`Se esperaba ${options.type}`);
      corrupt.delete(key);
      return { ok: true, missing: false, value, raw };
    } catch (error) {
      const issue = { key, raw, detectedAt: new Date().toISOString(), error: error.message };
      corrupt.set(key, issue);
      report(`No se pudo leer ${key}. Se conservó el contenido original.`, issue);
      return { ok: false, missing: false, value: clone(fallback), raw, error, corrupt: true };
    }
  }

  function safeWrite(key, value, options = {}) {
    if (corrupt.has(key) && !options.overwriteCorrupt) {
      report(`No se sobrescribió ${key} porque contiene datos dañados.`, corrupt.get(key));
      return false;
    }
    try {
      global.localStorage.setItem(key, options.raw ? String(value) : JSON.stringify(value));
      if (options.overwriteCorrupt) corrupt.delete(key);
      return true;
    } catch (error) {
      report(isQuotaError(error)
        ? 'No hay espacio suficiente para guardar. El estado sigue en memoria; descargá un backup antes de cerrar.'
        : `No se pudo guardar ${key}. El estado sigue en memoria.`, { key, error });
      return false;
    }
  }

  function safeRemove(key) {
    try { global.localStorage.removeItem(key); corrupt.delete(key); return true; }
    catch (error) { report(`No se pudo eliminar ${key}.`, { key, error }); return false; }
  }

  function loadApplicationState(defaults = {}) {
    const data = {};
    DATA_KEYS.forEach(field => {
      const fallback = defaults[field] ?? (ARRAY_FIELDS.has(field) ? [] : {});
      data[field] = safeRead(KEYS[field], fallback, { type: expectedType(field) }).value;
    });
    const version = safeRead(KEYS.schemaVersion, SCHEMA_VERSION).value;
    return { schemaVersion: Number(version) || SCHEMA_VERSION, data, issues: getCorruptionIssues() };
  }

  function saveApplicationState(data, options = {}) {
    const entries = DATA_KEYS.filter(field => Object.hasOwn(data, field)).map(field => [KEYS[field], data[field]]);
    entries.push([KEYS.schemaVersion, SCHEMA_VERSION]);
    const protectedEntry = entries.find(([key]) => corrupt.has(key) && !options.overwriteCorrupt);
    if (protectedEntry) { report(`Guardado cancelado para proteger ${protectedEntry[0]}.`, corrupt.get(protectedEntry[0])); return false; }
    const previous = entries.map(([key]) => [key, global.localStorage.getItem(key)]);
    try {
      entries.forEach(([key, value]) => global.localStorage.setItem(key, JSON.stringify(value)));
      if (options.overwriteCorrupt) entries.forEach(([key]) => corrupt.delete(key));
      return true;
    } catch (error) {
      previous.forEach(([key, raw]) => { try { raw === null ? global.localStorage.removeItem(key) : global.localStorage.setItem(key, raw); } catch {} });
      report(isQuotaError(error)
        ? 'No hay espacio suficiente para guardar. Los cambios siguen en memoria; descargá un backup.'
        : 'No se pudo guardar el estado completo; se restauró la persistencia anterior.', { error });
      return false;
    }
  }

  function createBackup(data, extra = {}) {
    return { app: APP_NAME, schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), data: clone(data), ...extra };
  }

  function normalizeLegacyBackup(value) {
    if (value?.app !== APP_NAME || value.schemaVersion != null || value.version !== 3) return value;
    const data = {};
    DATA_KEYS.forEach(field => { data[field] = value[field] ?? (ARRAY_FIELDS.has(field) ? [] : {}); });
    return { app: APP_NAME, schemaVersion: SCHEMA_VERSION, createdAt: value.exportedAt || new Date().toISOString(), data, legacyVersion: value.version };
  }

  function validateBackup(input) {
    let value = input;
    if (typeof input === 'string') {
      if (!input.trim()) return { ok: false, errors: ['El archivo está vacío.'] };
      try { value = JSON.parse(input); } catch { return { ok: false, errors: ['El archivo no contiene JSON válido.'] }; }
    }
    value = normalizeLegacyBackup(value);
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push('La raíz del backup debe ser un objeto.');
    if (value?.app !== APP_NAME) errors.push('El backup no pertenece a Tu Esquina.');
    if (!Number.isInteger(value?.schemaVersion)) errors.push('Falta schemaVersion o no es válido.');
    else if (value.schemaVersion > SCHEMA_VERSION) errors.push(`El backup usa schemaVersion ${value.schemaVersion}, superior a la versión compatible ${SCHEMA_VERSION}.`);
    else if (value.schemaVersion < 1) errors.push('La versión del backup no es compatible.');
    if (!value?.data || typeof value.data !== 'object' || Array.isArray(value.data)) errors.push('Falta el objeto data.');
    if (!errors.length) DATA_KEYS.forEach(field => {
      if (!Object.hasOwn(value.data, field)) errors.push(`Falta la colección ${field}.`);
      else if (!matchesType(value.data[field], expectedType(field))) errors.push(`La colección ${field} tiene un tipo incorrecto.`);
    });
    return { ok: errors.length === 0, errors, backup: errors.length ? null : value };
  }

  function migrateBackup(backup) {
    let current = clone(backup);
    const migrations = {};
    while (current.schemaVersion < SCHEMA_VERSION) {
      const migration = migrations[current.schemaVersion];
      if (!migration) throw new Error(`No existe migración desde schemaVersion ${current.schemaVersion}.`);
      current = migration(current);
    }
    return current;
  }

  function restoreApplicationState(backup, applyState) {
    const validation = validateBackup(backup);
    if (!validation.ok) return validation;
    let migrated;
    try { migrated = migrateBackup(validation.backup); }
    catch (error) { return { ok: false, errors: [error.message] }; }
    if (!saveApplicationState(migrated.data, { overwriteCorrupt: true })) return { ok: false, errors: ['No se pudo persistir el backup. Los datos actuales se conservaron.'] };
    applyState(clone(migrated.data));
    return { ok: true, errors: [], backup: migrated };
  }

  function clearApplicationData(emptyState) {
    return saveApplicationState(emptyState, { overwriteCorrupt: true });
  }

  function getCorruptionIssues() { return [...corrupt.values()].map(clone); }
  function createEmergencyExport() {
    return { app: APP_NAME, type: 'corruption-recovery', schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), issues: getCorruptionIssues() };
  }

  global.TuEsquinaStorage = Object.freeze({ APP_NAME, SCHEMA_VERSION, KEYS, DATA_KEYS, ARRAY_FIELDS, safeRead, safeWrite, safeRemove,
    loadApplicationState, saveApplicationState, createBackup, validateBackup, restoreApplicationState, clearApplicationData,
    createEmergencyExport, getCorruptionIssues, setErrorHandler(handler) { errorHandler = handler; } });
})(globalThis);
