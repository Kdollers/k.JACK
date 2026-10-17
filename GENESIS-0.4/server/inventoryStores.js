'use strict';
/**
 * Multiple stores (warehouses) and inter-store stock transfers.
 *
 * Company-wide inventory is never created or destroyed by a transfer:
 *   - DISPATCH takes the quantity out of the source store's stock_levels and
 *     holds it as "in transit" on the transfer document (products.current_stock,
 *     the consolidated company total, is untouched).
 *   - RECEIVE (full or partial) puts the quantity into the destination store.
 * Every step writes inventory_movements rows so each store keeps its own
 * movement history, and every state change is audited.
 *
 * States: DRAFT → DISPATCHED (in transit; partial receipts allowed) →
 * COMPLETED. DRAFT transfers can be CANCELLED.
 */
const { getDb } = require('./db');
const { generateId, roundTo } = require('./utils');
const { nextSequenceNumber, logAudit } = require('./accountingEngine');
const stockLedger = require('./stockLedger');

function listWarehouses(companyId, { includeInactive = false } = {}) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM stock_levels sl WHERE sl.warehouse_id = w.id AND sl.quantity <> 0) AS product_count,
      (SELECT COALESCE(SUM(sl.quantity), 0) FROM stock_levels sl WHERE sl.warehouse_id = w.id) AS total_quantity
    FROM warehouses w
    WHERE w.company_id = ?${includeInactive ? '' : ' AND w.active = 1'}
    ORDER BY w.is_default DESC, w.code ASC
  `).all(companyId);
  return rows.map(r => ({ ...r, total_quantity: roundTo(r.total_quantity, 4) }));
}

function getWarehouse(companyId, id) {
  return getDb().prepare(`SELECT * FROM warehouses WHERE id = ? AND company_id = ?`).get(id, companyId) || null;
}

function createWarehouse(companyId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const code = String(data.code || '').trim().toUpperCase();
    const name = String(data.name || '').trim();
    if (!/^[A-Z0-9._-]{2,20}$/.test(code)) throw new Error('Store code must be 2-20 characters: letters, digits, dot, dash or underscore.');
    if (!name) throw new Error('Store name is required.');
    const exists = db.prepare(`SELECT id FROM warehouses WHERE company_id = ? AND code = ?`).get(companyId, code);
    if (exists) throw new Error(`Store code ${code} already exists.`);

    const isFirst = db.prepare(`SELECT COUNT(*) AS n FROM warehouses WHERE company_id = ?`).get(companyId).n === 0;
    const isDefault = isFirst || !!data.isDefault;
    const id = generateId('wh');
    db.prepare(`
      INSERT INTO warehouses (id, company_id, code, name, address, is_default, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(id, companyId, code, name, data.address || null, isDefault ? 1 : 0);
    if (isDefault) {
      db.prepare(`UPDATE warehouses SET is_default = 0 WHERE company_id = ? AND id <> ?`).run(companyId, id);
    }
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'CREATE', id, `Created store ${code} (${name})`);
    return { id, code, name, isDefault };
  });
  return tx();
}

function updateWarehouse(companyId, id, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const wh = getWarehouse(companyId, id);
    if (!wh) throw new Error('Store not found.');
    const name = data.name != null ? String(data.name).trim() : wh.name;
    if (!name) throw new Error('Store name is required.');

    if (data.active === 0 || data.active === false) {
      if (wh.is_default) throw new Error('The default store cannot be deactivated. Choose another default store first.');
      const stock = db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS q FROM stock_levels WHERE warehouse_id = ?`).get(id).q;
      if (roundTo(stock, 4) > 0) throw new Error('This store still holds stock. Transfer the stock out before deactivating it.');
    }
    const makeDefault = data.isDefault === 1 || data.isDefault === true;
    db.prepare(`UPDATE warehouses SET name = ?, address = ?, active = ?, is_default = ? WHERE id = ?`)
      .run(name, data.address != null ? data.address : wh.address,
        (data.active === 0 || data.active === false) ? 0 : 1,
        makeDefault ? 1 : wh.is_default, id);
    if (makeDefault) {
      db.prepare(`UPDATE warehouses SET is_default = 0 WHERE company_id = ? AND id <> ?`).run(companyId, id);
    }
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'UPDATE', id, `Updated store ${wh.code}`);
    return getWarehouse(companyId, id);
  });
  return tx();
}

/** Consolidated + per-store stock for one product. */
function productStockByStore(companyId, productId) {
  const db = getDb();
  const product = db.prepare(`SELECT id, sku, name, current_stock FROM products WHERE id = ? AND company_id = ?`).get(productId, companyId);
  if (!product) throw new Error('Product not found.');
  return {
    product,
    companyStock: roundTo(product.current_stock || 0, 4),
    stores: stockLedger.stockByWarehouse(db, companyId, productId)
  };
}

function createTransfer(companyId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const { date = new Date().toISOString().split('T')[0], fromWarehouseId, toWarehouseId, notes = '', lines } = data;
    if (!lines || lines.length === 0) throw new Error('A transfer needs at least one product line.');
    const from = getWarehouse(companyId, fromWarehouseId);
    const to = getWarehouse(companyId, toWarehouseId);
    if (!from || !to) throw new Error('Source or destination store not found.');
    if (!from.active || !to.active) throw new Error('Both stores must be active.');
    if (from.id === to.id) throw new Error('Source and destination stores must be different.');

    const transferNumber = nextSequenceNumber(companyId, 'TRANSFER', 'TRF');
    const transferId = generateId('trf');
    let totalQty = 0;
    const prepared = [];
    for (const l of lines) {
      const qty = roundTo(Number(l.quantity), 4);
      if (!(qty > 0)) throw new Error('Transfer quantities must be greater than zero.');
      const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(l.productId, companyId);
      if (!prod) throw new Error('Product not found.');
      if (prod.type !== 'GOODS') throw new Error(`Only goods can be transferred between stores (${prod.name} is a service).`);
      const available = stockLedger.getStockAt(db, prod.id, from.id);
      if (available < qty - 0.00005) {
        throw new Error(`Insufficient stock for ${prod.name} in ${from.name}: available ${available}, requested ${qty}.`);
      }
      totalQty = roundTo(totalQty + qty, 4);
      prepared.push({ id: generateId('trfl'), productId: prod.id, qty, unitCost: roundTo(prod.cost_price || 0, 4), notes: l.notes || null });
    }

    db.prepare(`
      INSERT INTO stock_transfers (id, company_id, transfer_number, date, from_warehouse_id, to_warehouse_id, status, total_quantity, received_quantity, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, 0, ?, ?, datetime('now'))
    `).run(transferId, companyId, transferNumber, date, from.id, to.id, totalQty, notes || null, user?.id || 'system');
    const insertLine = db.prepare(`
      INSERT INTO stock_transfer_lines (id, transfer_id, product_id, quantity, received_quantity, unit_cost, notes)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);
    for (const p of prepared) insertLine.run(p.id, transferId, p.productId, p.qty, p.unitCost, p.notes);

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'CREATE', transferId,
      `Created stock transfer ${transferNumber} (${from.code} → ${to.code}, ${totalQty} units)`);
    return { transferId, transferNumber, status: 'DRAFT', totalQuantity: totalQty };
  });
  return tx();
}

function dispatchTransfer(companyId, transferId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const t = db.prepare(`SELECT * FROM stock_transfers WHERE id = ? AND company_id = ?`).get(transferId, companyId);
    if (!t) throw new Error('Transfer not found.');
    if (t.status !== 'DRAFT') throw new Error(`Only draft transfers can be dispatched (current status: ${t.status}).`);
    const lines = db.prepare(`SELECT * FROM stock_transfer_lines WHERE transfer_id = ?`).all(transferId);
    if (lines.length === 0) throw new Error('Transfer has no lines.');

    const from = getWarehouse(companyId, t.from_warehouse_id);
    const insertMov = db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
        quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, 'TRANSFER', 'STOCK_TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    for (const l of lines) {
      const storeStock = stockLedger.getStockAt(db, l.product_id, t.from_warehouse_id);
      if (storeStock < l.quantity - 0.00005) {
        const prod = db.prepare(`SELECT name FROM products WHERE id = ?`).get(l.product_id);
        throw new Error(`Insufficient stock for ${prod?.name} in ${from?.name}: available ${storeStock}, requested ${l.quantity}.`);
      }
    }
    for (const l of lines) {
      // Leave the source store; stay owned by the company (in transit).
      // products.current_stock (the consolidated total) is deliberately untouched.
      stockLedger.syncStockLevelDelta(db, l.product_id, t.from_warehouse_id, -l.quantity);
      const companyAfter = stockLedger.getCompanyStock(db, l.product_id);
      insertMov.run(generateId('mov'), companyId, l.product_id, t.date, t.id, t.transfer_number,
        -l.quantity, l.unit_cost, roundTo(l.quantity * l.unit_cost, 2), companyAfter,
        `Transfer ${t.transfer_number} dispatched (in transit to destination store)`, user?.id || 'system', t.from_warehouse_id);
    }

    db.prepare(`UPDATE stock_transfers SET status = 'DISPATCHED', dispatched_by = ?, dispatched_at = datetime('now') WHERE id = ?`)
      .run(user?.id || 'system', transferId);
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'DISPATCH', transferId,
      `Dispatched stock transfer ${t.transfer_number} (${from?.code} → destination store)`);
    return { transferId, transferNumber: t.transfer_number, status: 'DISPATCHED' };
  });
  return tx();
}

/**
 * Receives goods at the destination store. `receipts` maps transfer line ids
 * to quantities received now (partial receipts allowed). When every line is
 * fully received the transfer COMPLETES.
 */
function receiveTransfer(companyId, transferId, receipts, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const t = db.prepare(`SELECT * FROM stock_transfers WHERE id = ? AND company_id = ?`).get(transferId, companyId);
    if (!t) throw new Error('Transfer not found.');
    if (t.status !== 'DISPATCHED') throw new Error(`Only dispatched (in-transit) transfers can be received (current status: ${t.status}).`);
    const lines = db.prepare(`SELECT * FROM stock_transfer_lines WHERE transfer_id = ?`).all(transferId);
    const to = getWarehouse(companyId, t.to_warehouse_id);

    const insertMov = db.prepare(`
      INSERT INTO inventory_movements (
        id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
        quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
      ) VALUES (?, ?, ?, ?, 'TRANSFER', 'STOCK_TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    let receivedNow = 0;
    const updateLine = db.prepare(`UPDATE stock_transfer_lines SET received_quantity = ? WHERE id = ?`);
    for (const l of lines) {
      const want = receipts && receipts[l.id] != null ? roundTo(Number(receipts[l.id]), 4) : roundTo(l.quantity - l.received_quantity, 4);
      if (want < 0) throw new Error('Received quantities cannot be negative.');
      const outstanding = roundTo(l.quantity - l.received_quantity, 4);
      if (want > outstanding + 0.00005) {
        const prod = db.prepare(`SELECT name FROM products WHERE id = ?`).get(l.product_id);
        throw new Error(`Cannot receive more than outstanding for ${prod?.name}: outstanding ${outstanding}, requested ${want}.`);
      }
      if (want <= 0) continue;
      const newReceived = roundTo(l.received_quantity + want, 4);
      updateLine.run(newReceived, l.id);
      stockLedger.syncStockLevelDelta(db, l.product_id, t.to_warehouse_id, want);
      const companyAfter = stockLedger.getCompanyStock(db, l.product_id);
      insertMov.run(generateId('mov'), companyId, l.product_id, new Date().toISOString().split('T')[0], t.id, t.transfer_number,
        want, l.unit_cost, roundTo(want * l.unit_cost, 2), companyAfter,
        `Transfer ${t.transfer_number} received into ${to?.name}`, user?.id || 'system', t.to_warehouse_id);
      receivedNow = roundTo(receivedNow + want, 4);
    }
    if (receivedNow <= 0) throw new Error('Nothing to receive: all lines are already fully received.');

    const newTotalReceived = roundTo(t.received_quantity + receivedNow, 4);
    const complete = newTotalReceived >= roundTo(t.total_quantity, 4) - 0.00005;
    db.prepare(complete
      ? `UPDATE stock_transfers SET received_quantity = ?, status = 'COMPLETED', completed_by = ?, completed_at = datetime('now') WHERE id = ?`
      : `UPDATE stock_transfers SET received_quantity = ? WHERE id = ?`)
      .run(...(complete ? [newTotalReceived, user?.id || 'system', transferId] : [newTotalReceived, transferId]));

    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'RECEIVE', transferId,
      `Received ${receivedNow} units of stock transfer ${t.transfer_number}${complete ? ' (transfer completed)' : ' (partial receipt)'}`);
    return { transferId, transferNumber: t.transfer_number, status: complete ? 'COMPLETED' : 'DISPATCHED', receivedNow };
  });
  return tx();
}

function cancelTransfer(companyId, transferId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const t = db.prepare(`SELECT * FROM stock_transfers WHERE id = ? AND company_id = ?`).get(transferId, companyId);
    if (!t) throw new Error('Transfer not found.');
    if (t.status !== 'DRAFT') throw new Error(`Only draft transfers can be cancelled (current status: ${t.status}).`);
    db.prepare(`UPDATE stock_transfers SET status = 'CANCELLED' WHERE id = ?`).run(transferId);
    logAudit(companyId, user?.id, user?.full_name, 'INVENTORY', 'CANCEL', transferId, `Cancelled draft stock transfer ${t.transfer_number}`);
    return { transferId, transferNumber: t.transfer_number, status: 'CANCELLED' };
  });
  return tx();
}

function listTransfers(companyId, { status = null } = {}) {
  const db = getDb();
  const params = [companyId];
  let sql = `
    SELECT t.*, fw.code AS from_code, fw.name AS from_name, tw.code AS to_code, tw.name AS to_name
    FROM stock_transfers t
    JOIN warehouses fw ON fw.id = t.from_warehouse_id
    JOIN warehouses tw ON tw.id = t.to_warehouse_id
    WHERE t.company_id = ?`;
  if (status) { sql += ` AND t.status = ?`; params.push(status); }
  sql += ` ORDER BY t.created_at DESC`;
  return db.prepare(sql).all(...params);
}

function getTransfer(companyId, transferId) {
  const db = getDb();
  const t = db.prepare(`
    SELECT t.*, fw.code AS from_code, fw.name AS from_name, tw.code AS to_code, tw.name AS to_name
    FROM stock_transfers t
    JOIN warehouses fw ON fw.id = t.from_warehouse_id
    JOIN warehouses tw ON tw.id = t.to_warehouse_id
    WHERE t.id = ? AND t.company_id = ?
  `).get(transferId, companyId);
  if (!t) return null;
  const lines = db.prepare(`
    SELECT l.*, p.sku, p.name AS product_name, p.unit
    FROM stock_transfer_lines l JOIN products p ON p.id = l.product_id
    WHERE l.transfer_id = ?
  `).all(transferId);
  return { ...t, lines };
}

module.exports = {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  productStockByStore,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  listTransfers,
  getTransfer
};
