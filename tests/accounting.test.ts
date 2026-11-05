import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAccountEndingBalance,
  createChartOfAccount,
  createManualJournalEntry,
  deleteChartOfAccount,
  deleteManualJournalEntry,
  getAccountingOverview,
  inferAccountTypeFromCode,
  listChartOfAccounts,
  parseAccountingPeriodFilter,
  updateManualJournalEntry,
  updateManualJournalStatus,
  validateJournalEntryLines,
} from "../src/lib/accounting";
import { ensureSchema, runWithCompany } from "../src/lib/db";

test("accounting: pure helpers validate double-entry journal lines and ending balances accurately", () => {
  // 1. Account type inference from code prefix
  assert.equal(inferAccountTypeFromCode("11121.01"), "asset");
  assert.equal(inferAccountTypeFromCode("21210"), "liability");
  assert.equal(inferAccountTypeFromCode("31000"), "equity");
  assert.equal(inferAccountTypeFromCode("41010.01"), "revenue");
  assert.equal(inferAccountTypeFromCode("53031.01"), "expense");

  // 2. Ending balance calculation (Debit normal vs Credit normal)
  assert.equal(calculateAccountEndingBalance("debit", 200000, 34605), 165395);
  assert.equal(calculateAccountEndingBalance("credit", 5000, 57470), 52470);

  // 3. Balanced journal lines pass validation
  const balanced = validateJournalEntryLines([
    {
      accountCode: "11121.01",
      accountName: "กสิกรไทย",
      debit: 165395,
      credit: 0,
      memo: "ยอดยกมา",
    },
    {
      accountCode: "32000",
      accountName: "กำไรสะสม",
      debit: 0,
      credit: 165395,
      memo: "ยอดยกมา",
    },
  ]);
  assert.equal(balanced.valid, true);
  assert.equal(balanced.totalDebit, 165395);
  assert.equal(balanced.totalCredit, 165395);
  assert.equal(balanced.diff, 0);

  // 4. Unbalanced journal lines fail validation
  const unbalanced = validateJournalEntryLines([
    {
      accountCode: "11121.01",
      accountName: "กสิกรไทย",
      debit: 10000,
      credit: 0,
      memo: "",
    },
    {
      accountCode: "32000",
      accountName: "กำไรสะสม",
      debit: 0,
      credit: 9500,
      memo: "",
    },
  ]);
  assert.equal(unbalanced.valid, false);
  assert.equal(unbalanced.diff, 500);

  // 5. Period filter parser supports single month, year, month range, and date range
  assert.deepEqual(parseAccountingPeriodFilter("all"), {
    mode: "all",
    raw: "all",
  });
  assert.deepEqual(parseAccountingPeriodFilter("2026"), {
    mode: "year",
    raw: "2026",
    start: "2026",
    end: "2026",
  });
  assert.deepEqual(parseAccountingPeriodFilter("2026-10"), {
    mode: "month",
    raw: "2026-10",
    start: "2026-10",
    end: "2026-10",
  });
  assert.deepEqual(parseAccountingPeriodFilter("2026-08_2026-10"), {
    mode: "month_range",
    raw: "2026-08_2026-10",
    start: "2026-08",
    end: "2026-10",
  });
  assert.deepEqual(parseAccountingPeriodFilter("2026-01-01_2026-03-31"), {
    mode: "date_range",
    raw: "2026-01-01_2026-03-31",
    start: "2026-01-01",
    end: "2026-03-31",
  });
});

test("accounting: chart_of_accounts seeding, custom COA CRUD, manual JV/OP creation, and General Ledger aggregation", async (t) => {
  try {
    await ensureSchema();
  } catch {
    t.skip("ไม่มี Postgres หรือ credential — ข้าม integration test");
    return;
  }

  await runWithCompany("seeheng", async () => {
    let customAccountId = 0;
    let manualJournalDbId = 0;

    try {
      // 1. Seed & list standard 5-category Chart of Accounts
      const coa = await listChartOfAccounts();
      assert.ok(coa.length >= 30, "ต้องมีผังบัญชีมาตรฐานอย่างน้อย 30 บัญชีครบ 5 หมวด");
      assert.ok(coa.some((a) => a.accountCode === "11111" && a.accountType === "asset"));
      assert.ok(coa.some((a) => a.accountCode === "11121.01" && a.accountType === "asset"));
      assert.ok(coa.some((a) => a.accountCode === "21210" && a.accountType === "liability"));
      assert.ok(coa.some((a) => a.accountCode === "31000" && a.accountType === "equity"));
      assert.ok(coa.some((a) => a.accountCode === "41010.01" && a.accountType === "revenue"));
      assert.ok(coa.some((a) => a.accountCode === "51020" && a.accountType === "expense"));

      // 2. Add a custom account in COA
      const customCode = `11129.${Date.now().toString().slice(-4)}`;
      const createdAcc = await createChartOfAccount({
        accountCode: customCode,
        accountName: "บัญชีธนาคารทดสอบระบบ",
        accountType: "asset",
        primaryGroup: "สินทรัพย์หมุนเวียน",
        secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
        description: "สำหรับทดสอบระบบบัญชีแยกประเภท",
      });
      customAccountId = createdAcc.id;
      assert.equal(createdAcc.accountCode, customCode);
      assert.equal(createdAcc.isSystem, false);

      // 3. Create a manual Opening Balance Journal Entry (OP...)
      const voucher = await createManualJournalEntry({
        entryDate: "2026-01-01",
        journalType: "JV",
        documentPrefix: "OP",
        contactName: "ยอดยกมาต้นงวดทดสอบ",
        description: "ทดสอบตั้งยอดยกมาต้นปี 2026",
        lines: [
          {
            accountCode: customCode,
            accountName: "บัญชีธนาคารทดสอบระบบ",
            debit: 50000,
            credit: 0,
            memo: "ฝากเงินต้นงวด",
          },
          {
            accountCode: "31000",
            accountName: "ทุนจดทะเบียนชำระแล้ว",
            debit: 0,
            credit: 50000,
            memo: "ทุนจดทะเบียนต้นงวด",
          },
        ],
      });
      manualJournalDbId = voucher.dbId || 0;
      assert.ok(voucher.documentNo.startsWith("OP20260101"));
      assert.equal(voucher.totalDebit, 50000);
      assert.equal(voucher.totalCredit, 50000);

      // 4. Verify General Ledger Overview reflects the movement and balances
      const overview = await getAccountingOverview("2026");
      assert.equal(overview.selectedYear, "2026");
      const targetLedger = overview.accounts.find(
        (a) => a.accountCode === customCode,
      );
      assert.ok(targetLedger, "ต้องพบบัญชีที่สร้างใหม่ในตารางบัญชีแยกประเภท");
      assert.equal(targetLedger.totalDebit, 50000);
      assert.equal(targetLedger.totalCredit, 0);
      assert.equal(targetLedger.endingBalance, 50000);
      assert.equal(targetLedger.movementCount, 1);
      assert.equal(targetLedger.movements[0].runningBalance, 50000);

      // Verify total journal Debit == Credit across the entire overview
      assert.equal(
        overview.summary.totalJournalDebit,
        overview.summary.totalJournalCredit,
        "ผลรวมเดบิตและเครดิตของสมุดรายวันทั้งหมดต้องเท่ากันเสมอ",
      );

      // 5. Test editing manual journal entry & changing status (FlowAccount parity)
      const updatedVoucher = await updateManualJournalEntry(manualJournalDbId, {
        entryDate: "2026-01-05",
        journalType: "RV",
        documentPrefix: "RV",
        contactName: "ลูกค้าโอนเงิน",
        referenceNo: "REF-RV-001",
        description: "แก้ไขเป็นสมุดรายวันรับ RV",
        remarks: "ทดสอบแก้ไขสมุดรายวัน",
        status: "pending",
        lines: [
          {
            accountCode: customCode,
            accountName: "บัญชีธนาคารทดสอบระบบ",
            debit: 75000,
            credit: 0,
            memo: "รับเงินฝากเพิ่ม",
          },
          {
            accountCode: "31000",
            accountName: "ทุนจดทะเบียนชำระแล้ว",
            debit: 0,
            credit: 75000,
            memo: "ทุนจดทะเบียนเพิ่ม",
          },
        ],
      });
      assert.ok(updatedVoucher);
      assert.equal(updatedVoucher.journalType, "RV");
      assert.equal(updatedVoucher.status, "pending");
      assert.equal(updatedVoucher.totalDebit, 75000);
      assert.equal(updatedVoucher.remarks, "ทดสอบแก้ไขสมุดรายวัน");

      await updateManualJournalStatus(manualJournalDbId, "approved");
      const overviewAfterEdit = await getAccountingOverview("2026");
      const editedInOverview = overviewAfterEdit.journals.find(
        (j) => j.dbId === manualJournalDbId,
      );
      assert.ok(editedInOverview);
      assert.equal(editedInOverview.status, "approved");
      assert.equal(editedInOverview.totalDebit, 75000);
    } finally {
      if (manualJournalDbId > 0) {
        await deleteManualJournalEntry(manualJournalDbId).catch(() => {});
      }
      if (customAccountId > 0) {
        await deleteChartOfAccount(customAccountId).catch(() => {});
      }
    }
  });

  // Verify dragon19 (public schema) also gets its own isolated COA seeded even after seeheng ran first
  await runWithCompany("dragon19", async () => {
    const d19Overview = await getAccountingOverview("all");
    assert.ok(
      d19Overview.accounts.length >= 30,
      "dragon19 ต้องมีผังบัญชีครบ 5 หมวดแยกอิสระจาก seeheng",
    );
    assert.equal(
      d19Overview.summary.totalJournalDebit,
      d19Overview.summary.totalJournalCredit,
    );
  });
});
