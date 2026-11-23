import assert from "node:assert/strict";
import test from "node:test";
import { REFRESH_MARGIN_MS, tokenNeedsRefresh } from "../src/lib/platform/token-freshness";

const NOW = Date.parse("2026-11-23T02:10:00Z");

test("tokenNeedsRefresh: token ที่หมดอายุไปแล้วต้องต่ออายุ", () => {
  // ค่าที่ token จริงหมดอายุในเหตุการณ์ 21 พ.ย. 2026
  assert.equal(tokenNeedsRefresh("2026-11-21T08:12:43+00:00", NOW), true);
});

test("tokenNeedsRefresh: วันหมดอายุปี 2083 ที่ค้างอยู่ใน DB ต้องถูกต่ออายุ (ไม่ใช่เชื่อแล้วข้าม)", () => {
  // ค่าเดิมที่ DB เก็บไว้ตอนอ่าน expire_in ผิด — ถ้าเชื่อค่านี้จะไม่มีวันต่ออายุและซิงก์ตายค้าง
  assert.equal(tokenNeedsRefresh("2083-10-04T16:25:26+00:00", NOW), true);
});

test("tokenNeedsRefresh: วันหมดอายุที่ยังอยู่ในอายุจริงของ token (5 วัน) ไม่ต้องต่ออายุ", () => {
  assert.equal(tokenNeedsRefresh("2026-11-28T02:10:00+00:00", NOW), false);
});

test("tokenNeedsRefresh: เหลืออายุน้อยกว่า margin ให้ต่ออายุก่อนหมด", () => {
  const insideMargin = new Date(NOW + REFRESH_MARGIN_MS - 30_000).toISOString();
  const outsideMargin = new Date(NOW + REFRESH_MARGIN_MS + 60_000).toISOString();
  assert.equal(tokenNeedsRefresh(insideMargin, NOW), true);
  assert.equal(tokenNeedsRefresh(outsideMargin, NOW), false);
});

test("tokenNeedsRefresh: ไม่รู้วันหมดอายุ (null) ถือว่าต้องต่ออายุ", () => {
  assert.equal(tokenNeedsRefresh(null, NOW), true);
  assert.equal(tokenNeedsRefresh("", NOW), true);
});
