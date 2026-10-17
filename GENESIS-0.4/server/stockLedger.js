'use strict';
/**
 * Shared stock ledger — the ONLY place where stock quantities change.
 *
 * Every movement keeps four things consistent inside the caller's transaction:
 *   1. products.current_stock      — company-wide quantity (consolidated total)
 *   2. stock_levels                — per-warehouse quantity (multiple stores)
 *   3. inventory_movements         — immutable audit trail of the movement
 *   4. fifo_stock_layers           — FIFO cost layers (maintained for every
 *                                     company so the valuation method can be
 *                                     switched without losing cost history)
 *
 * Invariants:
 *   - sum(stock_levels.quantity) + in-transit transfer quantities
 *     == products.current_stock for every product. Internal transfers move
 *     stock between warehouses without creating or destroying company-wide
 *     inventory (dispatched-but-not-received quantities remain visible on the
 *     transfer document as in-transit).
 *   - Negative stock is rejected unless the caller explicitly allows it
 *     (physical-count variances may legitimately exceed on-hand records).
 */
const { generateId, roundTo } = require('./utils');

/** Returns the default warehouse id for a company, creating nothing. */
function defaultWarehouseId(db, companyId) {
  const wh = db.prepare(
    `SELECT id FROM warehouses WHERE company_id = ? AND active = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1`
  ).get(companyId);
  if (!wh) throw new Error('No active warehouse configured. Create a store first.');
  return wh.id;
}

/** On-hand quantity of a product in one warehouse. */
function getStockAt(db, productId, warehouseId) {
  const row = db.prepare(
    `SELECT quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`
  ).get(productId, warehouseId);
  return row ? roundTo(row.quantity, 4) : 0;
}

/** Consolidated company-wide quantity (products.current_stock). */
function getCompanyStock(db, productId) {
  const row = db.prepare(`SELECT current_stock FROM products WHERE id = ?`).get(productId);
  return row ? roundTo(row.current_stock || 0, 4) : 0;
}

/**
 * Applies a stock change (delta > 0 = in, delta < 0 = out) to one warehouse.
 * Throws when the movement would drive the warehouse or the company total
 * negative, unless opts.allowNegative is set (count variances, corrections).
 * Returns { newCompanyStock, newWarehouseStock, movementId, unitCost }.
 */
function moveStock(db, {
  companyId, productId, warehouseId = null, delta, date,
  movementType, referenceType = null, referenceId = null, referenceNumber = null,
  unitCost = null, notes = null, userId = null, allowNegative = false
}) {
  const qty = roundTo(Number(delta), 4);
  if (!qty) throw new Error('Stock movement quantity cannot be zero.');
  const whId = warehouseId || defaultWarehouseId(db, companyId);

  const product = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(productId, companyId);
  if (!product) throw new Error('Product not found.');

  const whStock = getStockAt(db, productId, whId);
  const companyStock = roundTo(product.current_stock || 0, 4);
  const cost = unitCost == null ? roundTo(product.cost_price || 0, 2) : roundTo(unitCost, 2);

  if (qty < 0 && !allowNegative) {
    if (whStock + qty < -0.00005) {
      throw new Error(`Insufficient stock for ${product.name}: available ${whStock}, requested ${-qty}.`);
    }
    if (companyStock + qty < -0.00005) {
      throw new Error(`Insufficient company stock for ${product.name}: available ${companyStock}, requested ${-qty}.`);
    }
  }

  const newCompanyStock = roundTo(companyStock + qty, 4);
  const newWarehouseStock = roundTo(whStock + qty, 4);

  db.prepare(`UPDATE products SET current_stock = ? WHERE id = ?`).run(newCompanyStock, productId);
  db.prepare(`
    INSERT INTO stock_levels (product_id, warehouse_id, quantity, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).run(productId, whId, newWarehouseStock, newWarehouseStock);

  const movementId = generateId('mov');
  db.prepare(`
    INSERT INTO inventory_movements (
      id, company_id, product_id, date, movement_type, reference_type, reference_id, reference_number,
      quantity, unit_cost, total_cost, stock_after, notes, user_id, created_at, warehouse_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    movementId, companyId, productId, date, movementType, referenceType, referenceId, referenceNumber,
    qty, cost, roundTo(qty * cost, 2), newCompanyStock, notes, userId || 'system', whId
  );

  return { movementId, newCompanyStock, newWarehouseStock, unitCost: cost };
}

/** Adds a FIFO cost layer (stock-in events). */
function addFifoLayer(db, { companyId, productId, warehouseId = null, qty, unitCost, date, sourceType, sourceId = null }) {
  const quantity = roundTo(Number(qty), 4);
  if (quantity <= 0) return null;
  const id = generateId('fifo');
  db.prepare(`
    INSERT INTO fifo_stock_layers (id, company_id, product_id, warehouse_id, quantity_remaining, unit_cost, received_date, source_type, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, companyId, productId, warehouseId, quantity, roundTo(unitCost, 4), date, sourceType, sourceId);
  return id;
}

/**
 * Consumes FIFO layers oldest-first (stock-out events).
 * Returns { layers: [{ layerId, qty, unitCost }], totalCost }.
 * Any remainder that no layer can cover is costed at the product's current
 * weighted-average cost_price so the ledger can never run short of a value.
 */
function consumeFifo(db, companyId, productId, qty, date) {
  const wanted = roundTo(Number(qty), 4);
  if (wanted <= 0) return { layers: [], totalCost: 0 };
  const layers = db.prepare(`
    SELECT * FROM fifo_stock_layers
    WHERE company_id = ? AND product_id = ? AND quantity_remaining > 0
    ORDER BY received_date ASC, created_at ASC, rowid ASC
  `).all(companyId, productId);

  let remaining = wanted;
  const consumed = [];
  const upd = db.prepare(`UPDATE fifo_stock_layers SET quantity_remaining = ? WHERE id = ?`);
  for (const layer of layers) {
    if (remaining <= 0.00005) break;
    const take = roundTo(Math.min(remaining, layer.quantity_remaining), 4);
    if (take <= 0) continue;
    upd.run(roundTo(layer.quantity_remaining - take, 4), layer.id);
    consumed.push({ layerId: layer.id, qty: take, unitCost: roundTo(layer.unit_cost, 4) });
    remaining = roundTo(remaining - take, 4);
  }
  let totalCost = consumed.reduce((s, c) => roundTo(s + c.qty * c.unitCost, 2), 0);
  if (remaining > 0.00005) {
    const prod = db.prepare(`SELECT cost_price FROM products WHERE id = ?`).get(productId);
    const fallback = roundTo(prod?.cost_price || 0, 4);
    consumed.push({ layerId: null, qty: remaining, unitCost: fallback });
    totalCost = roundTo(totalCost + remaining * fallback, 2);
  }
  return { layers: consumed, totalCost, date };
}

/** Recalculates the weighted-average cost_price after a stock-in event. */
function applyWeightedAverageCost(db, productId, addedQty, addedUnitCost) {
  const prod = db.prepare(`SELECT current_stock, cost_price FROM products WHERE id = ?`).get(productId);
  if (!prod) return 0;
  const currentQty = Math.max(0, roundTo(prod.current_stock || 0, 4));
  const currentCost = roundTo(prod.cost_price || 0, 4);
  const q = roundTo(Number(addedQty), 4);
  if (currentQty + q <= 0) return roundTo(addedUnitCost, 2);
  const newAvg = roundTo(((currentQty * currentCost) + (q * addedUnitCost)) / (currentQty + q), 2);
  db.prepare(`UPDATE products SET cost_price = ? WHERE id = ?`).run(newAvg, productId);
  return newAvg;
}

/**
 * Stock-in used by purchases and goods receipts: updates company + store
 * stock, records the movement, maintains the FIFO layer and (for weighted
 * average companies) the moving average cost. Returns the cost figures the
 * caller needs for its journal entry.
 */
function receiveStock(db, {
  companyId, productId, warehouseId = null, qty, unitCost, date,
  movementType, referenceType, referenceId, referenceNumber, notes, userId, sourceType
}) {
  const valuation = db.prepare(`SELECT inventory_valuation_method FROM companies WHERE id = ?`).get(companyId);
  const method = (valuation?.inventory_valuation_method || 'WEIGHTED_AVERAGE').toUpperCase();
  const whId = warehouseId || defaultWarehouseId(db, companyId);

  // Weighted average must be computed BEFORE the quantity is added.
  const avgCost = method === 'WEIGHTED_AVERAGE'
    ? applyWeightedAverageCost(db, productId, qty, unitCost)
    : roundTo(db.prepare(`SELECT cost_price FROM products WHERE id = ?`).get(productId)?.cost_price || unitCost, 2);

  const moved = moveStock(db, {
    companyId, productId, warehouseId: whId, delta: qty, date,
    movementType, referenceType, referenceId, referenceNumber,
    unitCost, notes, userId
  });
  addFifoLayer(db, { companyId, productId, warehouseId: whId, qty, unitCost, date, sourceType, sourceId: referenceId });
  return { ...moved, valuationMethod: method, newAvgCost: avgCost };
}

/**
 * Stock-out used by sales, adjustments and transfers-out: consumes FIFO
 * layers when the company uses FIFO, otherwise costs at the moving average.
 */
function issueStock(db, {
  companyId, productId, warehouseId = null, qty, date,
  movementType, referenceType, referenceId, referenceNumber, notes, userId, allowNegative = false
}) {
  const valuation = db.prepare(`SELECT inventory_valuation_method FROM companies WHERE id = ?`).get(companyId);
  const method = (valuation?.inventory_valuation_method || 'WEIGHTED_AVERAGE').toUpperCase();
  const whId = warehouseId || defaultWarehouseId(db, companyId);
  const prod = db.prepare(`SELECT cost_price, name FROM products WHERE id = ?`).get(productId);

  let cogsTotal;
  let unitCost;
  if (method === 'FIFO') {
    const { layers, totalCost } = consumeFifo(db, companyId, productId, qty, date);
    cogsTotal = totalCost;
    unitCost = qty > 0 ? roundTo(totalCost / qty, 4) : roundTo(prod?.cost_price || 0, 4);
  } else {
    unitCost = roundTo(prod?.cost_price || 0, 4);
    cogsTotal = roundTo(qty * unitCost, 2);
  }

  const moved = moveStock(db, {
    companyId, productId, warehouseId: whId, delta: -Math.abs(qty), date,
    movementType, referenceType, referenceId, referenceNumber,
    unitCost, notes, userId, allowNegative
  });
  return { ...moved, cogsTotal, unitCostUsed: unitCost, valuationMethod: method };
}

/** FIFO valuation per product (quantity and value of remaining layers). */
function fifoValuation(db, companyId) {
  return db.prepare(`
    SELECT f.product_id, p.sku, p.name,
           SUM(f.quantity_remaining) AS quantity,
           SUM(f.quantity_remaining * f.unit_cost) AS value
    FROM fifo_stock_layers f
    JOIN products p ON p.id = f.product_id
    WHERE f.company_id = ? AND f.quantity_remaining > 0
    GROUP BY f.product_id
    ORDER BY p.sku
  `).all(companyId).map(r => ({ ...r, quantity: roundTo(r.quantity, 4), value: roundTo(r.value, 2) }));
}

/**
 * Updates ONLY the per-warehouse stock_levels row (delta). Used by legacy
 * engine paths that already update products.current_stock and write their own
 * movement rows, so the store ledger stays consistent with the company total.
 */
function syncStockLevelDelta(db, productId, warehouseId, delta) {
  const qty = roundTo(Number(delta), 4);
  if (!qty || !warehouseId) return;
  const row = db.prepare(`SELECT quantity FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`).get(productId, warehouseId);
  const next = roundTo((row ? row.quantity : 0) + qty, 4);
  db.prepare(`
    INSERT INTO stock_levels (product_id, warehouse_id, quantity, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).run(productId, warehouseId, next, next);
}

/** Sets the per-warehouse stock_levels row to an absolute quantity. */
function setStockLevel(db, productId, warehouseId, quantity) {
  if (!warehouseId) return;
  const next = roundTo(Number(quantity), 4);
  db.prepare(`
    INSERT INTO stock_levels (product_id, warehouse_id, quantity, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(product_id, warehouse_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).run(productId, warehouseId, next, next);
}

/** Per-warehouse stock rows for one product or all products. */
function stockByWarehouse(db, companyId, productId = null) {  const sql = productId
    ? `SELECT sl.warehouse_id, w.code, w.name, sl.quantity
       FROM stock_levels sl JOIN warehouses w ON w.id = sl.warehouse_id
       WHERE w.company_id = ? AND sl.product_id = ?`
    : `SELECT sl.product_id, p.sku, p.name, sl.warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name, sl.quantity
       FROM stock_levels sl
       JOIN warehouses w ON w.id = sl.warehouse_id
       JOIN products p ON p.id = sl.product_id
       WHERE w.company_id = ?
       ORDER BY p.sku, w.code`;
  return (productId ? db.prepare(sql).all(companyId, productId) : db.prepare(sql).all(companyId))
    .map(r => ({ ...r, quantity: roundTo(r.quantity, 4) }));
}

module.exports = {
  defaultWarehouseId,
  getStockAt,
  getCompanyStock,
  moveStock,
  addFifoLayer,
  consumeFifo,
  applyWeightedAverageCost,
  receiveStock,
  issueStock,
  syncStockLevelDelta,
  setStockLevel,
  fifoValuation,
  stockByWarehouse
};
