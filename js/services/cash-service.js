(function initCashService(global) {
  'use strict';
  const fail = (code, message, details = {}) => ({ ok: false, code, message, details });
  const replaceObject = (target, snapshot) => { Object.keys(target).forEach(key => delete target[key]); Object.assign(target, snapshot); };
  const validNonNegative = value => Number.isFinite(Number(value)) && Number(value) >= 0;

  function ensureCashState(cash) {
    cash.sessions = Array.isArray(cash.sessions) ? cash.sessions : [];
    cash.movements = Array.isArray(cash.movements) ? cash.movements : [];
    if (!cash.activeSession && cash.open) {
      const legacyMovements = cash.movements.filter(item => !item.sessionId || item.sessionId === cash.sessionId).map(item => ({ ...item,
        sessionId: item.sessionId || cash.sessionId || null, occurredAt: item.occurredAt || item.date, type: item.type || (Number(item.amount) < 0 ? 'EXPENSE' : 'INCOME'),
        amount: Math.abs(Number(item.amount || 0)), reason: item.reason || item.note || 'Movimiento migrado' }));
      cash.activeSession = { id: cash.sessionId || `legacy-${cash.openedAt || Date.now()}`, openedAt: cash.openedAt || new Date().toISOString(),
        openingCash: Number(cash.opening || 0), status: 'OPEN', movements: legacyMovements };
    }
    return cash;
  }

  function syncLegacy(cash) {
    const active = cash.activeSession;
    cash.open = Boolean(active && active.status === 'OPEN'); cash.opening = active?.openingCash || 0; cash.openedAt = active?.openedAt || '';
  }

  function openCashSession(payload, context) {
    const { cash, persist, uid = crypto.randomUUID.bind(crypto), now = () => new Date().toISOString() } = context;
    ensureCashState(cash);
    if (cash.activeSession?.status === 'OPEN') return fail('CASH_ALREADY_OPEN', 'Ya existe una caja abierta.', { sessionId: cash.activeSession.id });
    if (!validNonNegative(payload.openingCash)) return fail('INVALID_OPENING_CASH', 'El efectivo inicial no es válido.');
    const snapshot = structuredClone(cash), session = { id: uid(), openedAt: payload.openedAt || now(), openingCash: Number(payload.openingCash), status: 'OPEN', movements: [], userId: payload.userId || 'Administrador' };
    cash.activeSession = session; syncLegacy(cash);
    if (!persist()) { replaceObject(cash, snapshot); return fail('PERSISTENCE_FAILED', 'No se pudo guardar la apertura de caja.'); }
    return { ok: true, session, warnings: [] };
  }

  function registerCashMovement(payload, context) {
    const { cash, persist, uid = crypto.randomUUID.bind(crypto), now = () => new Date().toISOString() } = context;
    ensureCashState(cash); const session = cash.activeSession;
    if (!session || session.status !== 'OPEN') return fail('CASH_NOT_OPEN', 'Primero debés abrir la caja.');
    if (!['INCOME', 'EXPENSE'].includes(payload.type)) return fail('INVALID_MOVEMENT_TYPE', 'El tipo debe ser INCOME o EXPENSE.');
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) return fail('INVALID_AMOUNT', 'El monto debe ser mayor que cero.');
    if (!String(payload.reason || '').trim()) return fail('REASON_REQUIRED', 'Indicá el motivo del movimiento.');
    const snapshot = structuredClone(cash), movement = { id: uid(), sessionId: session.id, occurredAt: payload.occurredAt || now(), date: payload.occurredAt || now(),
      amount: Number(payload.amount), type: payload.type, reason: String(payload.reason).trim(), note: String(payload.reason).trim(), userId: payload.userId || 'Administrador' };
    session.movements.unshift(movement); cash.movements.unshift({ ...movement, amount: movement.type === 'EXPENSE' ? -movement.amount : movement.amount });
    if (!persist()) { replaceObject(cash, snapshot); return fail('PERSISTENCE_FAILED', 'No se pudo guardar el movimiento de caja.'); }
    return { ok: true, movement, warnings: [] };
  }

  function expectedCash(session, sales) {
    const cashSales = sales.filter(sale => (sale.cashSessionId === session.id || (!sale.cashSessionId && String(session.id).startsWith('legacy-') && new Date(sale.date) >= new Date(session.openedAt))) && sale.paymentMethod === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const income = session.movements.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + Number(item.amount), 0);
    const expenses = session.movements.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + Number(item.amount), 0);
    return { expectedCash: Number(session.openingCash) + cashSales + income - expenses, cashSales, income, expenses };
  }

  function closeCashSession(payload, context) {
    const { cash, sales, persist, now = () => new Date().toISOString() } = context;
    ensureCashState(cash); const session = cash.activeSession;
    if (!session || session.status !== 'OPEN') return fail('CASH_NOT_OPEN', 'No hay una caja abierta.');
    if (!validNonNegative(payload.countedCash)) return fail('INVALID_COUNTED_CASH', 'El efectivo contado no es válido.');
    const snapshot = structuredClone(cash), totals = expectedCash(session, sales), closedAt = payload.closedAt || now();
    Object.assign(session, totals, { countedCash: Number(payload.countedCash), difference: Number(payload.countedCash) - totals.expectedCash, closedAt, status: 'CLOSED' });
    cash.sessions.unshift({ ...structuredClone(session), opening: session.openingCash, total: totals.expectedCash }); cash.activeSession = null; syncLegacy(cash);
    if (!persist()) { replaceObject(cash, snapshot); return fail('PERSISTENCE_FAILED', 'No se pudo guardar el cierre de caja.'); }
    return { ok: true, session, ...totals, difference: session.difference, warnings: [] };
  }

  global.CashService = Object.freeze({ ensureCashState, expectedCash, openCashSession, registerCashMovement, closeCashSession });
})(globalThis);
