'use strict';
/**
 * Goods receipts (GRN) against purchase orders.
 *
 * Business rule enforced here: creating a product, a purchase order or a
 * supplier invoice NEVER increases stock by itself. Stock increases only when
 * goods are actually received and the goods receipt is posted. Posting:
 *   - increases the destination store and the company-wide stock,
 *   - updates weighted-average cost / adds FIFO layers (shared stock ledger),
 *   - records a GOODS_RECEIPT_IN movement,
 *   - posts  Dr Merchandise Inventory / Cr GRNI (2120)  — a proper receipt.
 * A supplier invoice linked to a posted receipt then clears GRNI against AP
 * WITHOUT touching stock again (handled in accountingEngine.postPurchaseInvoice).
 */
const { getDb } = require('./db');
const { generateId, roundTo } = require('./utils');
const { nextSequenceNumber, logAudit, createJournalEntry } = require('./accountingEngine');
const stockLedger = require('./stockLedger');

function listGoodsReceipts(companyId) {
  return getDb().prepare(`
    SELECT gr.*, s.name AS supplier_name, w.name AS warehouse_name, w.code AS warehouse_code,
           po.po_number
    FROM goods_receipts gr
    JOIN suppliers s ON s.id = gr.supplier_id
    JOIN warehouses w ON w.id = gr.warehouse_id
    LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
    WHERE gr.company_id = ?
    ORDER BY gr.created_at DESC
  `).all(companyId);
}

function getGoodsReceipt(companyId, id) {
  const db = getDb();
  const gr = db.prepare(`
    SELECT gr.*, s.name AS supplier_name, w.name AS warehouse_name, po.po_number
    FROM goods_receipts gr
    JOIN suppliers s ON s.id = gr.supplier_id
    JOIN warehouses w ON w.id = gr.warehouse_id
    LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
    WHERE gr.id = ? AND gr.company_id = ?
  `).get(id, companyId);
  if (!gr) return null;
  const lines = db.prepare(`
    SELECT l.*, p.sku, p.name AS product_name, p.unit
    FROM goods_receipt_lines l JOIN products p ON p.id = l.product_id
    WHERE l.receipt_id = ?
  `).all(id);
  return { ...gr, lines };
}

/** Quantity of a PO line already on POSTED or pending DRAFT receipts. */
function committedQtyForPoLine(db, poLineId, excludeReceiptId = null) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(l.quantity_received), 0) AS q
    FROM goods_receipt_lines l
    JOIN goods_receipts gr ON gr.id = l.receipt_id
    WHERE l.po_line_id = ? AND gr.status IN ('DRAFT', 'POSTED')${excludeReceiptId ? ' AND gr.id <> ?' : ''}
  `).get(...(excludeReceiptId ? [poLineId, excludeReceiptId] : [poLineId]));
  return roundTo(row?.q || 0, 4);
}

function createGoodsReceipt(companyId, data, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const {
      date = new Date().toISOString().split('T')[0],
      purchaseOrderId = null,
      supplierId,
      warehouseId = null,
      notes = '',
      lines
    } = data;
    if (!lines || lines.length === 0) throw new Error('A goods receipt needs at least one product line.');
    const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ? AND company_id = ?`).get(supplierId, companyId);
    if (!supplier) throw new Error('Supplier not found.');
    const whId = warehouseId || stockLedger.defaultWarehouseId(db, companyId);
    const wh = db.prepare(`SELECT * FROM warehouses WHERE id = ? AND company_id = ? AND active = 1`).get(whId, companyId);
    if (!wh) throw new Error('Destination store not found or inactive.');

    let po = null;
    if (purchaseOrderId) {
      po = db.prepare(`SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?`).get(purchaseOrderId, companyId);
      if (!po) throw new Error('Purchase order not found.');
      if (po.status === 'CANCELLED') throw new Error('Cannot receive goods against a cancelled purchase order.');
    }

    const receiptNumber = nextSequenceNumber(companyId, 'GOODS_RECEIPT', 'GRN');
    const receiptId = generateId('grn');
    let totalQty = 0;
    let totalValue = 0;
    const prepared = [];

    for (const l of lines) {
      const qty = roundTo(Number(l.quantity), 4);
      if (!(qty > 0)) throw new Error('Received quantities must be greater than zero.');
      const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND company_id = ?`).get(l.productId, companyId);
      if (!prod) throw new Error('Product not found.');
      if (prod.type !== 'GOODS') throw new Error(`Only goods can be received into stock (${prod.name} is a service).`);

      let unitCost = l.unitCost != null ? roundTo(Number(l.unitCost), 4) : roundTo(prod.cost_price || 0, 4);
      let poLineId = l.poLineId || null;
      if (po) {
        const poLine = poLineId
          ? db.prepare(`SELECT * FROM purchase_order_lines WHERE id = ? AND po_id = ?`).get(poLineId, po.id)
          : db.prepare(`SELECT * FROM purchase_order_lines WHERE po_id = ? AND product_id = ?`).get(po.id, prod.id);
        if (!poLine) throw new Error(`Product ${prod.name} is not on purchase order ${po.po_number}.`);
        poLineId = poLine.id;
        unitCost = roundTo(poLine.unit_cost, 4);
        const committed = committedQtyForPoLine(db, poLine.id);
        if (committed + qty > roundTo(poLine.quantity, 4) + 0.00005) {
          throw new Error(`Receipt exceeds purchase order quantity for ${prod.name}: ordered ${poLine.quantity}, already received/committed ${committed}, requested ${qty}.`);
        }
      }
      totalQty = roundTo(totalQty + qty, 4);
      totalValue = roundTo(totalValue + qty * unitCost, 2);
      prepared.push({ id: generateId('grnl'), poLineId, productId: prod.id, qty, unitCost, notes: l.notes || null });
    }

    db.prepare(`
      INSERT INTO goods_receipts (id, company_id, receipt_number, purchase_order_id, supplier_id, warehouse_id, date, status, total_quantity, total_value, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, datetime('now'))
    `).run(receiptId, companyId, receiptNumber, po ? po.id : null, supplier.id, wh.id, date, totalQty, totalValue, notes || null, user?.id || 'system');
    const insertLine = db.prepare(`
      INSERT INTO goods_receipt_lines (id, receipt_id, po_line_id, product_id, quantity_received, unit_cost, line_total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of prepared) {
      insertLine.run(p.id, receiptId, p.poLineId, p.productId, p.qty, p.unitCost, roundTo(p.qty * p.unitCost, 2), p.notes);
    }

    logAudit(companyId, user?.id, user?.full_name, 'PURCHASES', 'CREATE', receiptId,
      `Created goods receipt ${receiptNumber}${po ? ` against PO ${po.po_number}` : ''} (${totalQty} units, $${totalValue})`);
    return { receiptId, receiptNumber, status: 'DRAFT', totalQuantity: totalQty, totalValue };
  });
  return tx();
}

function postGoodsReceipt(companyId, receiptId, user) {
  const db = getDb();
  const tx = db.transaction(() => {
    const gr = db.prepare(`SELECT * FROM goods_receipts WHERE id = ? AND company_id = ?`).get(receiptId, companyId);
    if (!gr) throw new Error('Goods receipt not found.');
    if (gr.status !== 'DRAFT') throw new Error(`Cannot post goods receipt with status ${gr.status}.`);
    const lines = db.prepare(`SELECT * FROM goods_receipt_lines WHERE receipt_id = ?`).all(receiptId);
    if (lines.length === 0) throw new Error('Cannot post an empty goods receipt.');

    // Re-validate against POSTED receipts at posting time (concurrent postings).
    for (const l of lines) {
      if (!l.po_line_id) continue;
      const poLine = db.prepare(`SELECT * FROM purchase_order_lines WHERE id = ?`).get(l.po_line_id);
      if (!poLine) continue;
      const posted = roundTo(db.prepare(`
        SELECT COALESCE(SUM(gl.quantity_received), 0) AS q
        FROM goods_receipt_lines gl JOIN goods_receipts g ON g.id = gl.receipt_id
        WHERE gl.po_line_id = ? AND g.status = 'POSTED' AND g.id <> ?
      `).get(l.po_line_id, receiptId).q, 4);
      if (posted + l.quantity_received > roundTo(poLine.quantity, 4) + 0.00005) {
        throw new Error('Receipt exceeds the purchase order quantity (another receipt was posted first).');
      }
    }

    // Increase stock through the shared stock ledger (store + company + WA/FIFO).
    for (const l of lines) {
      stockLedger.receiveStock(db, {
        companyId, productId: l.product_id, warehouseId: gr.warehouse_id,
        qty: l.quantity_received, unitCost: l.unit_cost, date: gr.date,
        movementType: 'GOODS_RECEIPT_IN', referenceType: 'GOODS_RECEIPT',
        referenceId: gr.id, referenceNumber: gr.receipt_number,
        notes: `Goods receipt ${gr.receipt_number}`, userId: user?.id, sourceType: 'GOODS_RECEIPT'
      });
      if (l.po_line_id) {
        db.prepare(`UPDATE purchase_order_lines SET received_qty = COALESCE(received_qty, 0) + ? WHERE id = ?`)
          .run(l.quantity_received, l.po_line_id);
      }
    }

    // Purchase order status: RECEIVED when every line is fully received.
    if (gr.purchase_order_id) {
      const poLines = db.prepare(`SELECT quantity, COALESCE(received_qty, 0) AS received FROM purchase_order_lines WHERE po_id = ?`).all(gr.purchase_order_id);
      const fully = poLines.length > 0 && poLines.every(pl => pl.received >= pl.quantity - 0.00005);
      const any = poLines.some(pl => pl.received > 0);
      const po = db.prepare(`SELECT status FROM purchase_orders WHERE id = ?`).get(gr.purchase_order_id);
      if (po && po.status !== 'CANCELLED' && po.status !== 'CONVERTED') {
        db.prepare(`UPDATE purchase_orders SET status = ? WHERE id = ?`)
          .run(fully ? 'RECEIVED' : (any ? 'PARTIALLY_RECEIVED' : po.status), gr.purchase_order_id);
      }
    }

    // Journal entry: Dr Merchandise Inventory / Cr GRNI (goods received, not yet invoiced).
    const invAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '1200' LIMIT 1`).get(companyId);
    const grniAccount = db.prepare(`SELECT id FROM accounts WHERE company_id = ? AND code = '2120' LIMIT 1`).get(companyId);
    if (!invAccount || !grniAccount) throw new Error('Inventory (1200) or GRNI (2120) account is not configured.');
    const totalValue = roundTo(lines.reduce((s, l) => roundTo(s + l.line_total, 2), 0), 2);
    let jeId = null;
    if (totalValue > 0) {
      const je = createJournalEntry({
        companyId,
        date: gr.date,
        reference: gr.receipt_number,
        description: `Goods Receipt ${gr.receipt_number} — inventory received, awaiting supplier invoice`,
        sourceType: 'GOODS_RECEIPT',
        sourceId: gr.id,
        lines: [
          { accountId: invAccount.id, description: `Inventory received: ${gr.receipt_number}`, debit: totalValue, credit: 0 },
          { accountId: grniAccount.id, description: `GRNI: ${gr.receipt_number}`, debit: 0, credit: totalValue }
        ],
        user
      });
      jeId = je.id;
    }

    db.prepare(`UPDATE goods_receipts SET status = 'POSTED', journal_entry_id = ? WHERE id = ?`).run(jeId, receiptId);
    logAudit(companyId, user?.id, user?.full_name, 'PURCHASES', 'POST', receiptId,
      `Posted goods receipt ${gr.receipt_number} (${gr.total_quantity} units, $${totalValue})`);
    return { receiptId, receiptNumber: gr.receipt_number, status: 'POSTED', journalEntryId: jeId, totalValue };
  });
  return tx();
}

module.exports = { listGoodsReceipts, getGoodsReceipt, createGoodsReceipt, postGoodsReceipt };
