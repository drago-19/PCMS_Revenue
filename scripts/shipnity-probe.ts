import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const BASE_URL = "https://www.shipnity.pro/api/v2";

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const token = process.env.SHIPNITY_API_TOKEN?.trim();
  const email = process.env.SHIPNITY_API_EMAIL?.trim();
  if (!token || !email) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SHIPNITY_API_TOKEN / SHIPNITY_API_EMAIL ใน .env — เอา token จาก Shipnity (ตั้งค่า > เชื่อมต่อระบบอื่น) แล้วใส่ทั้งสองค่า",
    );
  }

  const filter = argValue("filter", "open");
  const page = argValue("page", "1");
  const out = argValue("out", "output/shipnity-orders-sample.json");
  const url = `${BASE_URL}/orders?filter=${encodeURIComponent(filter)}&page=${encodeURIComponent(page)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Token token=${token}, email=${email}`,
      Accept: "application/json",
    },
  });
  const body = await res.text();
  console.log(`GET ${url}`);
  console.log(`HTTP ${res.status} ${res.statusText}`);

  if (!res.ok) {
    console.log("body:", body.slice(0, 1500));
    process.exitCode = 1;
    return;
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, body, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.log("response ไม่ใช่ JSON — เก็บดิบไว้ที่", out);
    return;
  }

  const root = parsed as Record<string, unknown>;
  console.log("top-level keys:", Object.keys(root).join(", "));
  for (const key of Object.keys(root)) {
    const value = root[key];
    if (Array.isArray(value)) {
      console.log(`  ${key}: array[${value.length}]`);
      const first = value[0];
      if (first && typeof first === "object") {
        console.log(`  ${key}[0] keys:`, Object.keys(first as object).join(", "));
        console.log(`  ${key}[0] sample:`, JSON.stringify(first).slice(0, 2500));
      }
    } else if (value && typeof value === "object") {
      console.log(`  ${key}: object keys`, Object.keys(value as object).join(", "));
    } else {
      console.log(`  ${key}:`, JSON.stringify(value));
    }
  }
  console.log("เก็บ response ดิบไว้ที่", out);
}

main().catch((error) => {
  console.error("probe failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
