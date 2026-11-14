// แถบช่วงเวลากลางของหมวด platform — ใช้แถบเดียวเหมือนกันทุกหน้า
// มีที่เดียวที่บอกว่ากำลังดูช่วงไหน ร้านไหน และข้อมูลถึงเมื่อไร
// ป้ายช่วงเวลาติดสถานะเสมอ: ไม่มี from/to ใน URL = 30 วัน (ค่าปริยาย)
// ไม่มีการเคลื่อนไหวโดยตั้งใจ: การเปลี่ยนช่วงคือการเปลี่ยนตัวเลข ต้องนิ่งเพื่อเทียบ

import Link from "next/link";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PlatformAutoRefresh } from "@/components/PlatformAutoRefresh";
import { SyncNowButton } from "@/components/SyncNowButton";
import { activePresetKey, periodPresets, thaiDateTime } from "@/lib/platform/period";
import { platformDbName, type PlatformKey } from "@/lib/platform/platforms";
import { getLastSyncAt } from "@/lib/platform/sync-state";
import { isSandboxShopName } from "@/lib/platform/platforms";
import { getActiveShopId } from "@/lib/platform/store";
import { cn } from "@/lib/utils";

export type PlatformAccount = { accountKey: string; shopName: string | null };

function hrefFor(
  basePath: string,
  period: { from?: string; to?: string },
  extra: { shop?: string; query?: Record<string, string | undefined> },
): string {
  const qs = new URLSearchParams();
  if (period.from) qs.set("from", period.from);
  if (period.to) qs.set("to", period.to);
  if (extra.shop) qs.set("shop", extra.shop);
  for (const [key, value] of Object.entries(extra.query ?? {})) {
    if (value) qs.set(key, value);
  }
  return qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
}

export async function PlatformPeriodBar({
  basePath,
  from,
  to,
  shop,
  platform = "tiktok",
  accounts,
  extraQuery,
  showSync = false,
  autoRefreshSeconds,
  lastSyncedAt,
}: {
  basePath: string;
  from?: string;
  to?: string;
  shop?: string;
  platform?: PlatformKey;
  accounts?: PlatformAccount[];
  extraQuery?: Record<string, string | undefined>;
  showSync?: boolean;
  autoRefreshSeconds?: number;
  lastSyncedAt?: string | null;
}) {
  const mergedExtraQuery: Record<string, string | undefined> = {
    ...(platform !== "tiktok" ? { platform } : {}),
    ...extraQuery,
  };
  // ทุกแท็บต้องบอกได้ว่าข้อมูลล่าสุดเมื่อไร — ถ้าหน้าไหนไม่ได้ส่งมา ให้อ่านจากรอบซิงก์ล่าสุดของแพลตฟอร์มนั้น
  const syncedAt = lastSyncedAt ?? (await getLastSyncAt(platformDbName(platform)));

  const activeKey = activePresetKey(from, to);
  const isCustom = Boolean((from || to) && !activeKey);

  // ชื่อร้านต้องเห็นเสมอ — แม้มีร้านเดียว เพราะตัวเลขทั้งหมดเป็นของร้านนั้น
  // โหมดทดสอบ (ร้านที่ใช้อยู่เป็น SANDBOX_): เห็นเฉพาะร้านทดสอบ
  // — กันการกดเข้าไปดูข้อมูลร้านจริงจากแถบนี้ระหว่างทดสอบ
  const allAccounts = accounts ?? [];
  const activeShopId = await getActiveShopId("TikTok");
  const testMode = isSandboxShopName(
    allAccounts.find((account) => account.accountKey === activeShopId)?.shopName,
  );
  // แสดงเฉพาะร้านของโหมดที่ใช้อยู่: โหมดจริง = ร้านจริง, โหมดทดสอบ = ร้านทดสอบ
  const accountList = allAccounts.filter((account) => isSandboxShopName(account.shopName) === testMode);
  const shopLabel = (() => {
    if (shop) {
      const found = accountList.find((account) => account.accountKey === shop);
      return found?.shopName ?? found?.accountKey ?? "ร้านที่เลือก";
    }
    if (accountList.length === 1) return accountList[0].shopName ?? accountList[0].accountKey;
    if (accountList.length > 1) return "ทุกร้านรวมกัน";
    return null;
  })();
  // PeriodPicker รับได้เฉพาะค่าที่เป็นสตริง — ตัดคีย์ที่ไม่มีค่าออกก่อน
  const pickerParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(mergedExtraQuery)) {
    if (value) pickerParams[key] = value;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {(accounts?.length ?? 0) > 1 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <span className="font-bold text-muted-foreground">ร้าน</span>
          <Link
            href={hrefFor(basePath, { from, to }, { query: mergedExtraQuery })}
            className={cn(
              "inline-flex min-h-[32px] items-center rounded-full px-2.5 font-bold",
              shop ? "text-muted-foreground hover:bg-muted" : "bg-muted text-foreground",
            )}
          >
            ทุกร้านรวมกัน
          </Link>
          {(accounts ?? []).map((account) => (
            <Link
              key={account.accountKey}
              href={hrefFor(basePath, { from, to }, { shop: account.accountKey, query: mergedExtraQuery })}
              className={cn(
                "inline-flex min-h-[32px] items-center rounded-full px-2.5 font-bold",
                shop === account.accountKey
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {account.shopName ?? account.accountKey}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="tablist" aria-label="ช่วงเวลา">
          {periodPresets().map((preset) => {
            const active = preset.key === activeKey;
            return (
              <Link
                key={preset.key}
                href={hrefFor(basePath, { from: preset.from, to: preset.to }, { shop, query: mergedExtraQuery })}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex min-h-[36px] items-center rounded-full border px-3 text-[12.5px] font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
          <PeriodPicker
            from={from}
            to={to}
            shop={shop}
            basePath={basePath}
            extraParams={pickerParams}
          />
          {isCustom ? (
            <Link
              href={hrefFor(basePath, {}, { shop, query: mergedExtraQuery })}
              className="inline-flex min-h-[36px] items-center px-2 text-[12.5px] underline underline-offset-2"
            >
              ล้างช่วงวันที่
            </Link>
          ) : null}
        </div>
        {showSync ? (
          <span className="ml-auto shrink-0">
            <SyncNowButton variant="outline" platform={platform} />
          </span>
        ) : null}
      </div>

      {shopLabel || syncedAt || autoRefreshSeconds ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
          {shopLabel ? (
            <span className="font-bold text-foreground">ร้าน {shopLabel}</span>
          ) : null}
          {shopLabel && (syncedAt || autoRefreshSeconds) ? <span aria-hidden="true">·</span> : null}
          {syncedAt ? <span>ข้อมูลถึง {thaiDateTime(syncedAt)}</span> : null}
          {syncedAt && autoRefreshSeconds ? <span aria-hidden="true">·</span> : null}
          {autoRefreshSeconds ? <PlatformAutoRefresh seconds={autoRefreshSeconds} /> : null}
        </p>
      ) : null}
    </div>
  );
}
