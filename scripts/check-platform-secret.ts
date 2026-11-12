// ตรวจสถานะการเข้ารหัส credential ของแพลตฟอร์มในฐานข้อมูล
// ใช้: pnpm exec tsx --env-file=.env scripts/check-platform-secret.ts
// พิมพ์เฉพาะสถานะ (เข้ารหัสแล้ว/ยัง) — ไม่พิมพ์ค่าลับหรือ ciphertext ออกมา

import pg from "pg";

async function main() {
  // ต่อฐานข้อมูลแบบเดียวกับ src/lib/db.ts (รองรับทั้ง DATABASE_URL และค่า PGHOST/PGUSER…)
  const client = new pg.Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.PGHOST ?? "127.0.0.1",
          port: Number(process.env.PGPORT ?? 5432),
          user: process.env.PGUSER ?? "postgres",
          password:
            process.env.PGPASSWORD ?? process.env.SUPABASE_POSTGRES_PASSWORD ?? "",
          database: process.env.PGDATABASE ?? "pcms_revenue",
        },
  );
  await client.connect();
  try {
    for (const schema of ["public", "seeheng"]) {
      const { rows } = await client.query<{ secret: string | null }>(
        `SELECT value_json->'tiktok'->>'appSecret' AS secret
         FROM ${schema}.app_settings
         WHERE setting_key = 'platform_api'`,
      );
      const secret = rows[0]?.secret ?? "";
      if (!secret) {
        console.log(`${schema}: ยังไม่ได้ตั้งค่า TikTok`);
        continue;
      }
      console.log(
        `${schema}: encrypted=${secret.startsWith("v1:")} length=${secret.length}`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ตรวจไม่สำเร็จ:", err instanceof Error ? err.message : err);
  process.exit(1);
});
