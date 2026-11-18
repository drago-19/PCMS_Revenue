// ปรับโครงสร้างฐานข้อมูลล่วงหน้า นอกเส้นทางคำขอของหน้าเว็บ
//
// ทำไมต้องมี: ensureSchema ในแอปจะรัน DDL ทั้งก้อน (~30 วิ) เมื่อเวอร์ชันในฐานข้อมูลไม่ตรงกับโค้ด
// ถ้าปล่อยให้เกิดตอนเปิดหน้าเว็บ คำขอทั้งหมดจะต่อคิวรอ DDL นั้น — รันสคริปต์นี้ก่อนใช้แอป
// หลังแก้ db.ts (bump SCHEMA_VERSION) แล้วหน้าเว็บจะไม่ต้องรอเลย

// ตั้งก่อนเรียก ensureSchema: รอ lock ได้นานถึง 60 วิ (ค่าเริ่มต้นในแอปคือ 3 วิ)
process.env.SCHEMA_LOCK_TIMEOUT = process.env.SCHEMA_LOCK_TIMEOUT ?? "60s";

import { ensureSchema } from "@/lib/db";
import { getPool } from "@/lib/db";

async function main() {
  const started = Date.now();
  await ensureSchema();
  const elapsed = Date.now() - started;

  const rows = await getPool().query<{ schema_name: string; version: string }>(
    `SELECT schema_name, version FROM app_schema_version ORDER BY 1`,
  );
  // ค่ามาจากฐานข้อมูล แต่ตัดขึ้นบรรทัดใหม่ก่อนพิมพ์ เพื่อไม่ให้ log เพี้ยน
  const clean = (value: string) => value.replace(/[\r\n]/g, " ");
  for (const row of rows.rows) {
    console.log(`${clean(row.schema_name)}: ${clean(row.version)}`);
  }
  console.log(`ใช้เวลา ${elapsed} ms${elapsed < 1000 ? " (ไม่มีอะไรต้องอัปเดต)" : " (อัปเดตโครงสร้างแล้ว)"}`);
  await getPool().end();
}

main().catch((error) => {
  console.error("อัปเดตโครงสร้างไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exit(1);
});
