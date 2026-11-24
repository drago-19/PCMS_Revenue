import assert from "node:assert/strict";
import test from "node:test";
import { parseImportMonth } from "../src/lib/import-month";

test("parseImportMonth: เดือนปกติคืนช่วงวันที่ครบเดือนและชื่อเดือนไทย พ.ศ.", () => {
  assert.deepEqual(parseImportMonth("2026-11"), {
    key: "2026-11",
    start: "2026-11-01",
    end: "2026-11-30",
    label: "พฤศจิกายน 2569",
  });
});

test("parseImportMonth: กุมภาพันธ์นับวันสุดท้ายตามปีอธิกสุรทิน", () => {
  assert.equal(parseImportMonth("2026-02")?.end, "2026-02-28");
  assert.equal(parseImportMonth("2028-02")?.end, "2028-02-29");
});

test("parseImportMonth: ตัดช่องว่างหัวท้ายได้", () => {
  assert.equal(parseImportMonth("  2026-01 ")?.key, "2026-01");
});

test("parseImportMonth: รูปแบบผิดหรือเดือนไม่มีจริงคืน null (ไม่เดาเดือนให้ผู้ใช้)", () => {
  for (const raw of [
    "",
    null,
    undefined,
    "2026-13",
    "2026-00",
    "2026-1",
    "11-2026",
    "2026/11",
    "abc",
    "2026-11-01",
  ]) {
    assert.equal(parseImportMonth(raw), null, `ต้องไม่รับค่า ${String(raw)}`);
  }
});

test("parseImportMonth: ปีนอกช่วง 2000-2100 คืน null", () => {
  assert.equal(parseImportMonth("1999-12"), null);
  assert.equal(parseImportMonth("2101-01"), null);
});
