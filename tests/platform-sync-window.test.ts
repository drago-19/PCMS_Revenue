import assert from "node:assert/strict";
import test from "node:test";
import { parseSyncWindow } from "../src/lib/platform/sync-window";

const NOW = Math.floor(Date.parse("2026-11-23T02:30:00Z") / 1000);

function parse(query: string) {
  return parseSyncWindow(new URLSearchParams(query), NOW);
}

test("parseSyncWindow: ไม่ส่งพารามิเตอร์ = ดึงย้อน 36 ชม. โหมด update", () => {
  const parsed = parse("");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.window, {
    from: NOW - 36 * 3600,
    to: NOW,
    kind: "sync-now",
    mode: "update",
  });
  assert.equal(parsed.wait, false);
});

test("parseSyncWindow: hours เกิน 36 ถูกบีบไว้ที่ 36 และ hours=0 ใช้ค่าเริ่มต้น", () => {
  const capped = parse("hours=200");
  const zero = parse("hours=0");
  assert.equal(capped.ok && capped.window.from, NOW - 36 * 3600);
  assert.equal(zero.ok && zero.window.from, NOW - 36 * 3600);
});

test("parseSyncWindow: ช่วงวันไม่ส่ง mode = โหมด create (พฤติกรรมเดิมของปุ่มดึงย้อน)", () => {
  const parsed = parse("from=2026-11-21&to=2026-11-24");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.window.kind, "backfill");
  assert.equal(parsed.window.mode, "create");
  assert.equal(parsed.window.from, Math.floor(Date.parse("2026-11-21T00:00:00Z") / 1000));
});

test("parseSyncWindow: mode=update ดึงออเดอร์ที่ถูกแก้ไขในช่วงเดียวกัน", () => {
  const parsed = parse("from=2026-11-21&to=2026-11-22&mode=update&wait=1");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.window.mode, "update");
  assert.equal(parsed.wait, true);
});

test("parseSyncWindow: mode อื่นที่ไม่ใช่ update ต้องกลับเป็น create", () => {
  const parsed = parse("from=2026-11-21&to=2026-11-22&mode=delete");
  assert.equal(parsed.ok && parsed.window.mode, "create");
});

test("parseSyncWindow: to ต้องอยู่หลัง from และช่วงต้องไม่เกิน 31 วัน", () => {
  const reversed = parse("from=2026-11-22&to=2026-11-22");
  const tooWide = parse("from=2026-10-01&to=2026-11-24");
  assert.equal(reversed.ok, false);
  assert.equal(tooWide.ok, false);
  if (reversed.ok || tooWide.ok) return;
  assert.match(reversed.error, /ช่วงวันที่ไม่ถูกต้อง/);
  assert.match(tooWide.error, /ไม่เกิน 31 วัน/);
});
