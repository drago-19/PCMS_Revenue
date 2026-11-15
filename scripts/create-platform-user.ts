// สร้าง/ตั้งรหัสผ่านใหม่ให้บัญชีที่ถูกจำกัดสิทธิ์ (ค่าเริ่มต้น = role "platform")
//
// บัญชี role "platform" เข้าได้เฉพาะ /platform, /platform/*, /settings (แท็บเชื่อมต่อ)
// และ API ของ /api/platform/* — หน้าอื่นและ API อื่นถูกกันที่ src/proxy.ts
//
// วิธีใช้ (รันในโปรเจกต์ ที่มี .env):
//   pnpm user:platform -- --user sales1
//   pnpm user:platform -- --user sales1 --password "รหัสผ่านอย่างน้อย 12 ตัว"
//   pnpm user:platform -- --user someone --role staff
//
// ไม่ใส่ --password = สคริปต์สร้างรหัสสุ่มให้และพิมพ์ออกมาครั้งเดียว

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? "postgres",
    password:
      process.env.PGPASSWORD ?? process.env.SUPABASE_POSTGRES_PASSWORD ?? "",
    database: process.env.PGDATABASE ?? "pcms_revenue",
  };
}

// ค่าที่พิมพ์ออก log ต้องไม่มี CR/LF (กันการปลอมบรรทัด log)
function printable(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}

function randomPassword(): string {
  // 20 ตัว อักษรใหญ่/เล็ก/ตัวเลข/อักขระพิเศษ อย่างละอย่างน้อย 1 ตัว
  // (ไม่ใช้เครื่องหมายที่ทำให้ shell/PowerShell อ่านผิด เช่น " ' ` \)
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{}:,.?";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 20) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function main() {
  const username = arg("user", "").trim();
  const role = arg("role", "platform").trim();
  const company = arg("company", "dragon19").trim();
  const explicitPassword = arg("password", "").trim();

  if (!username) {
    console.error("ต้องระบุ --user <ชื่อผู้ใช้>");
    process.exit(1);
  }
  if (role !== "platform" && role !== "staff" && role !== "admin") {
    console.error("--role ต้องเป็น platform, staff หรือ admin");
    process.exit(1);
  }
  if (company !== "dragon19" && company !== "seeheng") {
    console.error("--company ต้องเป็น dragon19 หรือ seeheng");
    process.exit(1);
  }
  if (explicitPassword && explicitPassword.length < MIN_PASSWORD_LENGTH) {
    console.error(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
    process.exit(1);
  }

  const password = explicitPassword || randomPassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const pool = new Pool({ ...connectionConfig(), max: 1 });
  try {
    const exists = await pool.query<{ username: string }>(
      "SELECT username FROM public.app_users WHERE LOWER(username) = LOWER($1)",
      [username],
    );

    if (exists.rows[0]) {
      await pool.query(
        `UPDATE public.app_users
            SET password_hash = $2,
                role = $3,
                password_changed_at = now(),
                updated_at = now()
          WHERE LOWER(username) = LOWER($1)`,
        [username, passwordHash, role],
      );
      console.log(`อัปเดตบัญชีเดิม: ${printable(exists.rows[0].username)}`);
    } else {
      await pool.query(
        `INSERT INTO public.app_users (username, password_hash, role, password_changed_at, updated_at)
         VALUES ($1, $2, $3, now(), now())`,
        [username, passwordHash, role],
      );
      console.log(`สร้างบัญชีใหม่: ${printable(username)}`);
    }

    console.log(`  role    : ${printable(role)}`);
    console.log(`  company : ${printable(company)}`);
    if (!explicitPassword) {
      console.log(`  password: ${password}   (คัดลอกไว้ — ระบบไม่แสดงซ้ำ)`);
    }
    if (role === "platform") {
      console.log("\nบัญชีนี้เข้าได้เฉพาะ /platform, /settings (แท็บเชื่อมต่อ) และ /api/platform/*");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
