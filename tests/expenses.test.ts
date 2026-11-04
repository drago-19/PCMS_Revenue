import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateExpenseTaxAmounts,
  createExpenseCategory,
  createExpenseRecord,
  deleteExpenseCategory,
  deleteExpenseRecord,
  getExpensesOverview,
  getMonthlyPlatformRevenues,
  listExpenseCategories,
  listExpenseRecords,
  updateExpenseCategory,
  updateExpenseRecord,
  upsertMonthlyExpense,
} from "../src/lib/expenses";
import { ensureSchema, runWithCompany } from "../src/lib/db";

test("expenses: calculateExpenseTaxAmounts accurately computes VAT 7% (none, exclude, include) and WHT", () => {
  // 1. No VAT, no WHT
  const noTax = calculateExpenseTaxAmounts(5000, "none", 0);
  assert.equal(noTax.subtotalAmount, 5000);
  assert.equal(noTax.vatAmount, 0);
  assert.equal(noTax.totalAmount, 5000);
  assert.equal(noTax.whtAmount, 0);
  assert.equal(noTax.netPaidAmount, 5000);

  // 2. Exclude VAT 7% + WHT 3% (e.g. cleaning service 5,000 + VAT 350 = 5,350, WHT 3% of 5,000 = 150 -> net paid 5,200)
  const exVat = calculateExpenseTaxAmounts(5000, "exclude", 3);
  assert.equal(exVat.subtotalAmount, 5000);
  assert.equal(exVat.vatAmount, 350);
  assert.equal(exVat.totalAmount, 5350);
  assert.equal(exVat.whtRate, 3);
  assert.equal(exVat.whtAmount, 150);
  assert.equal(exVat.netPaidAmount, 5200);

  // 3. Include VAT 7% + WHT 1% (e.g. shipping 1,070 inc VAT -> subtotal 1,000, VAT 70, WHT 10 -> net paid 1,060)
  const incVat = calculateExpenseTaxAmounts(1070, "include", 1);
  assert.equal(incVat.subtotalAmount, 1000);
  assert.equal(incVat.vatAmount, 70);
  assert.equal(incVat.totalAmount, 1070);
  assert.equal(incVat.whtAmount, 10);
  assert.equal(incVat.netPaidAmount, 1060);
});

test("expenses: categories CRUD, dynamic columns, accounting records (EXP docNo, VAT/WHT, status), and monthly rollup calculations", async (t) => {
  try {
    await ensureSchema();
  } catch {
    t.skip("ไม่มี Postgres หรือ credential — ข้าม integration test");
    return;
  }

  // Test in seeheng schema to not pollute public data, and always clean up in finally
  await runWithCompany("seeheng", async () => {
    let cat1Id = 0;
    let cat2Id = 0;
    try {
      // 1. Initial categories list
      const initialCats = await listExpenseCategories();
      assert.ok(Array.isArray(initialCats));

      // 2. Create new dynamic categories with accountCode & color
      const catName1 = `ค่าแอดทดสอบ_${Date.now()}`;
      const cat1 = await createExpenseCategory(catName1, "rose", "51020.99");
      cat1Id = cat1.id;
      assert.equal(cat1.name, catName1);
      assert.equal(cat1.accountCode, "51020.99");
      assert.equal(cat1.color, "rose");
      assert.ok(cat1.id > 0);

      const catName2 = `ค่าเช่าทดสอบ_${Date.now()}`;
      const cat2 = await createExpenseCategory(catName2, "purple", "53032.99");
      cat2Id = cat2.id;
      assert.equal(cat2.name, catName2);
      assert.equal(cat2.accountCode, "53032.99");

      // Verify duplicate name fails
      await assert.rejects(
        async () => {
          await createExpenseCategory(catName1);
        },
        /unique|duplicate/i,
      );

      // Verify validation (empty name)
      await assert.rejects(
        async () => {
          await createExpenseCategory("   ");
        },
        /กรุณาระบุชื่อคอลัมน์/,
      );

      // 3. Update category name, color, and accountCode
      const updatedName = `${catName1}_updated`;
      const updatedCat = await updateExpenseCategory(
        cat1.id,
        updatedName,
        "blue",
        "51020.88",
      );
      assert.ok(updatedCat);
      assert.equal(updatedCat.name, updatedName);
      assert.equal(updatedCat.color, "blue");
      assert.equal(updatedCat.accountCode, "51020.88");

      // 4. Monthly direct expense upsert
      const testYm = "2026-10";
      await upsertMonthlyExpense(testYm, cat1.id, 15000);
      await upsertMonthlyExpense(testYm, cat2.id, 25000);

      // 5. Itemized expense record creation with VAT & WHT & vendor info
      const record = await createExpenseRecord({
        entryDate: "2026-10-15",
        categoryId: cat1.id,
        amount: 5000,
        vatType: "exclude",
        whtRate: 3,
        vendorName: "บริษัท คลีน จำกัด",
        vendorTaxId: "0105555123456",
        taxInvoiceNo: "INV-202610-001",
        paymentStatus: "paid",
        paymentMethod: "transfer",
        title: "ยิงแอด TikTok แคมเปญกลางเดือน",
        note: "สลิป 12345",
      });
      assert.match(record.documentNo, /^EXP20261015\d{4}$/);
      assert.equal(record.subtotalAmount, 5000);
      assert.equal(record.vatAmount, 350);
      assert.equal(record.amount, 5350); // Total including VAT
      assert.equal(record.whtAmount, 150);
      assert.equal(record.netPaidAmount, 5200);
      assert.equal(record.vendorName, "บริษัท คลีน จำกัด");
      assert.equal(record.yearMonth, "2026-10");

      // 6. List records
      const records = await listExpenseRecords("2026-10", cat1.id);
      assert.ok(records.some((r) => r.id === record.id && r.amount === 5350));

      // 7. Overview calculation check
      const overview = await getExpensesOverview("2026");
      assert.ok(overview.categories.some((c) => c.id === cat1.id));

      const rowOct = overview.rows.find((r) => r.yearMonth === "2026-10");
      if (rowOct) {
        // cat1 amount should be direct (15000) + itemized (5350) = 20350
        assert.equal(rowOct.categoryAmounts[cat1.id], 20350);
        assert.equal(rowOct.directAmounts[cat1.id], 15000);
        assert.equal(rowOct.categoryItemCounts[cat1.id], 1);

        // cat2 amount should be direct 25000
        assert.equal(rowOct.categoryAmounts[cat2.id], 25000);
      }

      // 8. Update record status to 'void' and verify it is excluded from monthly expense rollup
      const voided = await updateExpenseRecord(record.id, {
        paymentStatus: "void",
      });
      assert.ok(voided);
      assert.equal(voided.paymentStatus, "void");

      const overviewAfterVoid = await getExpensesOverview("2026");
      const rowOctAfterVoid = overviewAfterVoid.rows.find(
        (r) => r.yearMonth === "2026-10",
      );
      if (rowOctAfterVoid) {
        assert.equal(rowOctAfterVoid.categoryAmounts[cat1.id], 15000);
        assert.equal(rowOctAfterVoid.categoryItemCounts[cat1.id], 0);
      }

      // 9. Delete record
      const deletedRec = await deleteExpenseRecord(record.id);
      assert.equal(deletedRec, true);

      const recordsAfter = await listExpenseRecords("2026-10", cat1.id);
      assert.ok(!recordsAfter.some((r) => r.id === record.id));

      // 10. Delete category (cascade deletes associated monthly expenses)
      const deletedCat1 = await deleteExpenseCategory(cat1.id);
      assert.equal(deletedCat1, true);
      cat1Id = 0;

      const deletedCat2 = await deleteExpenseCategory(cat2.id);
      assert.equal(deletedCat2, true);
      cat2Id = 0;

      const finalCats = await listExpenseCategories();
      assert.ok(!finalCats.some((c) => c.id === cat1.id || c.id === cat2.id));
    } finally {
      if (cat1Id > 0) {
        await deleteExpenseCategory(cat1Id).catch(() => {});
      }
      if (cat2Id > 0) {
        await deleteExpenseCategory(cat2Id).catch(() => {});
      }
    }
  });
});

test("expenses: monthly platform revenue aggregation separates channels accurately", async (t) => {
  let revs;
  try {
    revs = await getMonthlyPlatformRevenues();
  } catch {
    t.skip("ไม่มี Postgres หรือ credential — ข้าม integration test");
    return;
  }
  assert.ok(Array.isArray(revs));

  for (const r of revs) {
    assert.match(r.yearMonth, /^\d{4}-\d{2}$/);
    const sum =
      Math.round(
        (r.tiktokPayout +
          r.shopeePayout +
          r.facebookPayout +
          (r.lazadaPayout ?? 0) +
          r.linePayout +
          r.otherPayout) *
          100,
      ) / 100;
    assert.equal(r.totalPlatformPayout, sum);
  }
});
