import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPool } from "../src/lib/db";
import { importWorkbook } from "../src/lib/ingest/import-service";

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const directory = resolve(args[0] || join(process.cwd(), "imports", "inbox"));
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

  const files = readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"))
    .sort();

  if (files.length === 0) {
    console.log(`ไม่พบไฟล์ .xlsx ใน ${directory}`);
    console.log("วางไฟล์ export จาก TikTok Shop ไว้ในโฟลเดอร์นี้ แล้วรันคำสั่งอีกครั้ง");
    return;
  }

  let imported = 0;
  let duplicated = 0;
  let failed = 0;

  try {
    for (const name of files) {
      try {
        const result = await importWorkbook({
          filename: name,
          buffer: readFileSync(join(directory, name)),
          source: "cli",
        });
        if (result.duplicate) {
          duplicated++;
          console.log(`= ${name}: เคยนำเข้าแล้ว (#${result.importId})`);
        } else {
          imported++;
          console.log(
            `+ ${name}: ${result.orderCount} บิล / ${result.transactionCount} รายการ${
              result.status === "warning" ? " (มีคำเตือน)" : ""
            }`,
          );
        }
      } catch (error) {
        failed++;
        console.log(`! ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await getPool().end();
  }

  console.log(`\nสรุป: นำเข้าใหม่ ${imported} ไฟล์, ซ้ำ ${duplicated} ไฟล์, ผิดพลาด ${failed} ไฟล์`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("ทำงานไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
