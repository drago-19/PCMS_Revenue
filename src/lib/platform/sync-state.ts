// เวลาซิงก์ล่าสุดของแพลตฟอร์ม — ใช้แสดง "ข้อมูลถึง …" ให้ทุกแท็บเห็นตรงกัน

import { query } from "@/lib/db";

export async function getLastSyncAt(platform = "TikTok"): Promise<string | null> {
  const rows = await query<{ at: string | null }>(
    `SELECT max(finished_at)::text AS at FROM platform_sync_runs WHERE status = 'done' AND platform = $1`,
    [platform],
  );
  return rows[0]?.at ?? null;
}
