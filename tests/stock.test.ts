import test from "node:test";
import assert from "node:assert/strict";
import { getPool } from "@/lib/db";
import {
  listProductStockPaged,
  updateProductStock,
  createProduct,
  deleteProduct,
  bulkUpdateProductStock,
  listAllProductsForStockExport,
} from "@/lib/queries";

test("stock: listProductStockPaged returns valid all-time stock summaries with accurate formula", async () => {
  const result = await listProductStockPaged({ pageSize: 10, sort: "qty_desc" });

  assert.ok(result.total > 0, "total products should be greater than 0");
  assert.ok(result.rows.length > 0, "should return rows");
  assert.equal(typeof result.totals.skuCount, "number");
  assert.equal(typeof result.totals.totalStockValue, "number");
  assert.equal(typeof result.totals.totalRemainingUnits, "number");
  assert.equal(typeof result.totals.totalCogs, "number");
  assert.equal(typeof result.totals.allCount, "number");

  for (const row of result.rows) {
    assert.ok(row.skuCode, "skuCode must exist");
    assert.equal(typeof row.costPrice, "number");
    assert.equal(typeof row.initialStock, "number");
    assert.equal(typeof row.stockIn, "number");
    assert.equal(typeof row.soldQty, "number");
    assert.equal(typeof row.totalSoldAllTime, "number");

    // Check remaining formula: (initial + in) - totalSold
    const expectedRemaining = row.initialStock + row.stockIn - row.totalSoldAllTime;
    assert.equal(row.remainingStock, expectedRemaining, "remainingStock formula must hold");

    // Check stock value: max(0, remaining) * cost
    const expectedStockValue = Math.round((Math.max(0, expectedRemaining) * row.costPrice) * 100) / 100;
    assert.equal(row.stockValue, expectedStockValue, "stockValue formula must hold");

    // Check cogs: soldQty * cost
    const expectedCogs = Math.round((row.soldQty * row.costPrice) * 100) / 100;
    assert.equal(row.cogs, expectedCogs, "cogs formula must hold");
  }
});

test("stock: updateProductStock correctly persists cost and stock, creates movement record, and updates calculations", async () => {
  const pool = getPool();
  const testSku = "TEST-SKU-STOCK-01";

  // Ensure test product exists
  await pool.query(
    `INSERT INTO products (sku_code, product_name, default_price, cost_price, initial_stock, stock_in)
     VALUES ($1, 'เสื้อทดสอบสต็อกระบบ', 199, 0, 0, 0)
     ON CONFLICT (sku_code) DO UPDATE SET cost_price = 0, initial_stock = 0, stock_in = 0`,
    [testSku],
  );

  try {
    // 1. Update initial stock and cost price
    const updateRes = await updateProductStock(testSku, {
      costPrice: 85.5,
      initialStock: 500,
      stockIn: 50,
      note: "ทดสอบการรับเข้าสต็อก",
    });

    assert.ok(updateRes.ok, "update should succeed");
    assert.ok(updateRes.product, "updated product should be returned");
    assert.equal(updateRes.product?.costPrice, 85.5);
    assert.equal(updateRes.product?.initialStock, 500);
    assert.equal(updateRes.product?.stockIn, 50);

    // Verify stock_movements record was logged
    const movements = await pool.query(
      `SELECT * FROM stock_movements WHERE sku_code = $1 ORDER BY id DESC`,
      [testSku],
    );
    assert.ok(movements.rows.length > 0, "movement should be recorded");
    assert.equal(movements.rows[0].quantity, 50);
    assert.equal(movements.rows[0].note, "ทดสอบการรับเข้าสต็อก");

    // 2. Query via listProductStockPaged
    const paged = await listProductStockPaged({ q: testSku, pageSize: 1 });
    assert.equal(paged.total, 1);
    const item = paged.rows[0]!;
    assert.equal(item.skuCode, testSku);
    assert.equal(item.costPrice, 85.5);
    assert.equal(item.initialStock, 500);
    assert.equal(item.stockIn, 50);
    assert.equal(item.remainingStock, 550);
    assert.equal(item.stockValue, 550 * 85.5);
  } finally {
    // Clean up test data
    await pool.query(`DELETE FROM stock_movements WHERE sku_code = $1`, [testSku]);
    await pool.query(`DELETE FROM products WHERE sku_code = $1`, [testSku]);
  }
});

test("stock: bulkUpdateProductStock accurately updates multiple SKUs in batch", async () => {
  const pool = getPool();
  const sku1 = "TEST-BULK-01";
  const sku2 = "TEST-BULK-02";

  await pool.query(
    `INSERT INTO products (sku_code, product_name, default_price)
     VALUES ($1, 'สินค้าทดสอบกลุ่ม 1', 250), ($2, 'สินค้าทดสอบกลุ่ม 2', 350)
     ON CONFLICT (sku_code) DO NOTHING`,
    [sku1, sku2],
  );

  try {
    const bulkRes = await bulkUpdateProductStock([
      { skuCode: sku1, costPrice: 90, initialStock: 200, stockIn: 20 },
      { skuCode: sku2, costPrice: 120, initialStock: 300, stockIn: 30 },
    ]);

    assert.equal(bulkRes.updatedCount, 2);

    const check = await pool.query(
      `SELECT sku_code, cost_price, initial_stock, stock_in FROM products WHERE sku_code IN ($1, $2) ORDER BY sku_code`,
      [sku1, sku2],
    );

    assert.equal(check.rows.length, 2);
    assert.equal(check.rows[0].cost_price, 90);
    assert.equal(check.rows[0].initial_stock, 200);
    assert.equal(check.rows[0].stock_in, 20);

    assert.equal(check.rows[1].cost_price, 120);
    assert.equal(check.rows[1].initial_stock, 300);
    assert.equal(check.rows[1].stock_in, 30);
  } finally {
    await pool.query(`DELETE FROM products WHERE sku_code IN ($1, $2)`, [sku1, sku2]);
  }
});

test("stock: listAllProductsForStockExport returns full inventory rows for Excel generation", async () => {
  const exportRows = await listAllProductsForStockExport();
  assert.ok(exportRows.length > 0, "export list should have products");

  const sample = exportRows[0]!;
  assert.ok(sample.skuCode);
  assert.ok(sample.productName);
  assert.equal(typeof sample.defaultPrice, "number");
  assert.equal(typeof sample.costPrice, "number");
  assert.equal(typeof sample.initialStock, "number");
  assert.equal(typeof sample.stockIn, "number");
  assert.equal(typeof sample.totalSoldAllTime, "number");
  assert.equal(typeof sample.remainingStock, "number");
  assert.equal(typeof sample.stockValue, "number");
  assert.equal(typeof sample.cogs, "number");
});

test("stock: listAllProductsForStockExport supports date (month and day) filtering for Excel export", async () => {
  // Test month export (YYYY-MM)
  const monthExport = await listAllProductsForStockExport({ date: "2026-10" });
  assert.ok(monthExport.length > 0, "should return products for month export");
  assert.equal(typeof monthExport[0]!.soldQty, "number");
  assert.equal(typeof monthExport[0]!.cogs, "number");
  assert.equal(typeof monthExport[0]!.totalSoldAllTime, "number");

  // Test day export (YYYY-MM-DD)
  const dayExport = await listAllProductsForStockExport({ date: "2026-10-15" });
  assert.ok(dayExport.length > 0, "should return products for day export");
  assert.equal(typeof dayExport[0]!.soldQty, "number");
  assert.equal(typeof dayExport[0]!.cogs, "number");
  assert.equal(typeof dayExport[0]!.totalSoldAllTime, "number");

  // Test onlySold option (Option 3 for accounting: filters out products with soldQty === 0)
  const allExport = await listAllProductsForStockExport({ onlySold: false });
  const soldOnlyExport = await listAllProductsForStockExport({ onlySold: true });
  assert.ok(soldOnlyExport.length <= allExport.length, "sold only export should have <= items than full export");
  for (const item of soldOnlyExport) {
    assert.ok(item.soldQty > 0, "every item in soldOnlyExport must have soldQty > 0");
  }
});

test("stock: createProduct and deleteProduct manage new manual SKU lifecycle", async () => {
  const newSku = "NEW-TEST-SKU-999";
  const pool = getPool();

  // Clean before test just in case
  await pool.query("DELETE FROM stock_movements WHERE sku_code = $1", [newSku]);
  await pool.query("DELETE FROM products WHERE sku_code = $1", [newSku]);

  try {
    // 1. Create product
    const createRes = await createProduct({
      skuCode: newSku,
      productName: "กางเกงรุ่นทดสอบใหม่พิเศษ",
      defaultPrice: 590,
      costPrice: 220,
      initialStock: 80,
      stockIn: 20,
      note: "ทดสอบการสร้าง SKU ใหม่",
    });

    assert.ok(createRes.ok, "createProduct should succeed");
    assert.ok(createRes.product, "product should be returned");
    assert.equal(createRes.product?.skuCode, newSku);
    assert.equal(createRes.product?.productName, "กางเกงรุ่นทดสอบใหม่พิเศษ");
    assert.equal(createRes.product?.costPrice, 220);
    assert.equal(createRes.product?.initialStock, 80);
    assert.equal(createRes.product?.stockIn, 20);
    assert.equal(createRes.product?.remainingStock, 100);
    assert.equal(createRes.product?.stockValue, 100 * 220);

    // Check is_manual column
    const manualCheck = await pool.query(
      "SELECT is_manual FROM products WHERE sku_code = $1",
      [newSku],
    );
    assert.equal(manualCheck.rows[0]?.is_manual, true, "is_manual should be true");

    // 2. Reject duplicate SKU
    const dupRes = await createProduct({
      skuCode: newSku,
      productName: "ชื่อซ้ำ",
    });
    assert.equal(dupRes.ok, false);
    assert.ok(dupRes.error?.includes("มีอยู่ในระบบแล้ว"));

    // 3. Update product name via updateProductStock
    const renameRes = await updateProductStock(newSku, {
      productName: "กางเกงรุ่นทดสอบใหม่พิเศษ (ปรับชื่อ)",
      costPrice: 230,
    });
    assert.ok(renameRes.ok);
    assert.equal(renameRes.product?.productName, "กางเกงรุ่นทดสอบใหม่พิเศษ (ปรับชื่อ)");
    assert.equal(renameRes.product?.costPrice, 230);

    // 4. Delete product
    const deleteRes = await deleteProduct(newSku);
    assert.ok(deleteRes.ok, "delete should succeed when 0 sales");

    const afterDelete = await pool.query("SELECT 1 FROM products WHERE sku_code = $1", [newSku]);
    assert.equal(afterDelete.rows.length, 0, "product should be deleted from db");
  } finally {
    await pool.query("DELETE FROM stock_movements WHERE sku_code = $1", [newSku]);
    await pool.query("DELETE FROM products WHERE sku_code = $1", [newSku]);
  }
});

test("stock: bulkUpdateProductStock inserts new SKUs when they do not exist (Excel upsert)", async () => {
  const pool = getPool();
  const brandNewSku = "BRAND-NEW-EXCEL-SKU";

  await pool.query("DELETE FROM products WHERE sku_code = $1", [brandNewSku]);

  try {
    const res = await bulkUpdateProductStock([
      {
        skuCode: brandNewSku,
        productName: "เสื้อเชิ้ตลายใหม่จาก Excel",
        costPrice: 150,
        initialStock: 50,
        stockIn: 10,
      },
    ]);

    assert.equal(res.insertedCount, 1, "should have 1 inserted count");

    const check = await pool.query(
      "SELECT sku_code, product_name, cost_price, initial_stock, stock_in, is_manual FROM products WHERE sku_code = $1",
      [brandNewSku],
    );
    assert.equal(check.rows.length, 1);
    assert.equal(check.rows[0].product_name, "เสื้อเชิ้ตลายใหม่จาก Excel");
    assert.equal(check.rows[0].cost_price, 150);
    assert.equal(check.rows[0].initial_stock, 50);
    assert.equal(check.rows[0].stock_in, 10);
    assert.equal(check.rows[0].is_manual, true);
  } finally {
    await pool.query("DELETE FROM products WHERE sku_code = $1", [brandNewSku]);
  }
});
