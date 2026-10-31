import assert from "node:assert/strict";
import test from "node:test";
import {
  createExpenseCategory,
  createExpenseRecord,
  deleteExpenseCategory,
  deleteExpenseRecord,
  getExpensesOverview,
  getMonthlyPlatformRevenues,
  listExpenseCategories,
  listExpenseRecords,
  updateExpenseCategory,
  upsertMonthlyExpense,
} from "../src/lib/expenses";
import { ensureSchema, query, runWithCompany } from "../src/lib/db";

test("expenses: categories CRUD, dynamic columns, and monthly rollup calculations", async (t) => {
  try {
    await ensureSchema();
  } catch {
    t.skip("ไม่มี Postgres หรือ credential — ข้าม integration test");
    return;
  }

  // Test in seeheng schema to not pollute public data
  await runWithCompany("seeheng", async () => {
    // 1. Initial categories list
    const initialCats = await listExpenseCategories();
    assert.ok(Array.isArray(initialCats));

    // 2. Create new dynamic categories
    const catName1 = `ค่าแอดทดสอบ_${Date.now()}`;
    const cat1 = await createExpenseCategory(catName1);
    assert.equal(cat1.name, catName1);
    assert.ok(cat1.id > 0);

    const catName2 = `ค่าเช่าทดสอบ_${Date.now()}`;
    const cat2 = await createExpenseCategory(catName2);
    assert.equal(cat2.name, catName2);

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

    // 3. Update category
    const updatedName = `${catName1}_updated`;
    const updatedCat = await updateExpenseCategory(cat1.id, updatedName);
    assert.ok(updatedCat);
    assert.equal(updatedCat.name, updatedName);

    // 4. Monthly direct expense upsert
    const testYm = "2026-10";
    await upsertMonthlyExpense(testYm, cat1.id, 15000);
    await upsertMonthlyExpense(testYm, cat2.id, 25000);

    // 5. Itemized expense record creation
    const record = await createExpenseRecord({
      entryDate: "2026-10-15",
      categoryId: cat1.id,
      amount: 5000,
      title: "ยิงแอด TikTok แคมเปญกลางเดือน",
      note: "สลิป 12345",
    });
    assert.equal(record.amount, 5000);
    assert.equal(record.yearMonth, "2026-10");

    // 6. List records
    const records = await listExpenseRecords("2026-10", cat1.id);
    assert.ok(records.some((r) => r.id === record.id && r.amount === 5000));

    // 7. Overview calculation check
    const overview = await getExpensesOverview("2026");
    assert.ok(overview.categories.some((c) => c.id === cat1.id));

    const rowOct = overview.rows.find((r) => r.yearMonth === "2026-10");
    if (rowOct) {
      // cat1 amount should be direct (15000) + itemized (5000) = 20000
      assert.equal(rowOct.categoryAmounts[cat1.id], 20000);
      assert.equal(rowOct.directAmounts[cat1.id], 15000);
      assert.equal(rowOct.categoryItemCounts[cat1.id], 1);

      // cat2 amount should be direct 25000
      assert.equal(rowOct.categoryAmounts[cat2.id], 25000);

      // Total expenses should include both
      assert.ok(rowOct.totalExpenses >= 45000);

      // Net remaining = totalPlatformPayout - totalExpenses
      const expectedNet = Math.round((rowOct.totalPlatformPayout - rowOct.totalExpenses) * 100) / 100;
      assert.equal(rowOct.netRemaining, expectedNet);
    }

    // 8. Delete record
    const deletedRec = await deleteExpenseRecord(record.id);
    assert.equal(deletedRec, true);

    const recordsAfter = await listExpenseRecords("2026-10", cat1.id);
    assert.ok(!recordsAfter.some((r) => r.id === record.id));

    // 9. Delete category (cascade deletes associated monthly expenses)
    const deletedCat1 = await deleteExpenseCategory(cat1.id);
    assert.equal(deletedCat1, true);

    const deletedCat2 = await deleteExpenseCategory(cat2.id);
    assert.equal(deletedCat2, true);

    const finalCats = await listExpenseCategories();
    assert.ok(!finalCats.some((c) => c.id === cat1.id || c.id === cat2.id));
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
    const sum = Math.round((r.tiktokPayout + r.shopeePayout + r.facebookPayout) * 100) / 100;
    assert.equal(r.totalPlatformPayout, sum);
  }
});
