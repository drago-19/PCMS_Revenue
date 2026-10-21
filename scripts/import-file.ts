import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { getPool, queryOne } from "../src/lib/db";
import { importWorkbook } from "../src/lib/ingest/import-service";
import { formatTHB } from "../src/lib/format";

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const fileArgument = args[0];
  if (!fileArgument) {
    console.error("ใช้งาน: pnpm run import:file -- <path-to.xlsx>");
    process.exitCode = 1;
    return;
  }
  const filePath = resolve(fileArgument);
  try {
    const buffer = readFileSync(filePath);
    const result = await importWorkbook({
      filename: basename(filePath),
      buffer,
      source: "cli",
    });
    if (result.duplicate) {
      console.log(`ไฟล์นี้เคยนำเข้าแล้ว (import #${result.importId}) – ไม่บันทึกซ้ำ`);
    } else {
      console.log(`นำเข้าสำเร็จ: import #${result.importId}`);
      console.log(`  ไฟล์: ${result.filename}`);
      console.log(`  แถวข้อมูล: ${result.rowCount}`);
      console.log(`  บิล (คำสั่งซื้อ): ${result.orderCount}`);
      console.log(`  รายการทั้งหมด: ${result.transactionCount}`);
      console.log(`  รอบชำระ: ${result.periodStart ?? "-"} ถึง ${result.periodEnd ?? "-"}`);
      const orderPayout = await queryOne<{ payout: string | number }>(
        "SELECT ROUND(SUM(payout)::numeric, 2) AS payout FROM transactions WHERE import_id = $1 AND is_order = 1",
        [result.importId],
      );
      console.log(`  ยอดชำระจากบิล: ${formatTHB(Number(orderPayout?.payout ?? 0))}`);
      const payout = result.reconciliation.metrics.find((metric) => metric.key === "payout");
      console.log(`  ยอดสุทธิของรอบ (รวมรายการอื่น): ${formatTHB(payout?.detail ?? 0)}`);
      console.log(
        `  ตรวจยอดกับชีตสรุป: ${
          result.reconciliation.matched === true
            ? "ตรง"
            : result.reconciliation.matched === false
              ? "ไม่ตรง"
              : "ไม่มีชีตสรุป"
        }`,
      );
      if (result.warnings.length > 0) {
        console.log(`  คำเตือน ${result.warnings.length} รายการ:`);
        for (const warning of result.warnings) {
          console.log(`   - [${warning.severity}] ${warning.message}`);
        }
      }
    }
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  console.error("นำเข้าไม่สำเร็จ:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
