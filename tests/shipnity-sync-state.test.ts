import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/lib/db";
import { readSyncState, writeSyncState } from "../src/lib/shipnity/store";

// เดิม writeSyncState เขียน now() ทับ last_sync_at ทุกรอบ รวมรอบที่ล้มเหลว
// หน้าเว็บจึงขึ้น "ข้อมูลจาก Shipnity ณ <เวลาใหม่>" ทั้งที่ข้อมูลยังเก่าหลายวัน
// เทสต์นี้ล็อกพฤติกรรมใหม่: สำเร็จ = เลื่อนเวลา, ล้มเหลว = เก็บเวลาเดิมและบันทึกสาเหตุ
test("สถานะซิงก์ Shipnity: รอบสำเร็จเลื่อนเวลา รอบล้มเหลวไม่ทับเวลาเดิม", async () => {
  const accountKey = `test-sync-state-${Date.now()}`;
  try {
    await writeSyncState(accountKey, { orderCount: 5, lastError: null });
    const first = await readSyncState(accountKey);
    assert.ok(first?.lastSyncAt, "รอบแรกที่สำเร็จต้องมีเวลาดึงล่าสุด");
    assert.equal(first?.lastError, null);
    assert.equal(first?.orderCount, 5);

    await writeSyncState(accountKey, {
      orderCount: 7,
      lastError: 'Shipnity ตอบ 500: {"status":500,"error":"Internal Server Error"}',
    });
    const failed = await readSyncState(accountKey);
    assert.equal(
      failed?.lastError?.startsWith("Shipnity ตอบ 500"),
      true,
      "ต้องเก็บสาเหตุที่ดึงไม่สำเร็จไว้ให้หน้าจอแสดง",
    );
    assert.equal(
      failed?.lastSyncAt,
      first?.lastSyncAt,
      "รอบที่ล้มเหลวต้องไม่เลื่อนเวลาที่ดึงสำเร็จล่าสุด",
    );
    assert.equal(failed?.orderCount, 7);

    // เว้นระยะให้เวลาของรอบใหม่ต่างจากรอบแรกจริง (now() ละเอียดถึงไมโครวินาที)
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeSyncState(accountKey, { orderCount: 8, lastError: null });
    const recovered = await readSyncState(accountKey);
    assert.equal(recovered?.lastError, null, "รอบที่สำเร็จต้องล้าง error เดิม");
    assert.ok(
      recovered?.lastSyncAt && first?.lastSyncAt && recovered.lastSyncAt > first.lastSyncAt,
      "รอบที่สำเร็จรอบใหม่ต้องเลื่อนเวลาขึ้น",
    );
  } finally {
    await query("DELETE FROM shipnity_sync_state WHERE account_key = $1", [accountKey]);
  }
});
