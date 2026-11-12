import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { PageHeader } from "@/components/PageHeader";
import { PlatformDashboardView } from "@/components/PlatformDashboard";
import { PlatformAutoRefresh } from "@/components/PlatformAutoRefresh";
import { IconInfo, IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTikTokAnalytics } from "@/lib/platform/analytics";
import { getPlatformConfig, listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "ดึงข้อมูลจากแพลตฟอร์ม" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PLATFORM_TABS = [
  { key: "tiktok", label: "TikTok Shop", hint: "ยอดเงิน + สถานะพัสดุ จาก API จริง" },
  { key: "shopee", label: "Shopee", hint: "ยังไม่เริ่ม — รอเงื่อนไขร้าน Mall/Managed" },
] as const;

type PlatformKey = (typeof PLATFORM_TABS)[number]["key"];

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function readPlatform(value: string | string[] | undefined): PlatformKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return PLATFORM_TABS.some((tab) => tab.key === raw) ? (raw as PlatformKey) : "tiktok";
}

function buildFlash(params: Record<string, string | string[] | undefined>) {
  const status = readParam(params, "tiktok");
  if (!status) return null;

  if (status === "connected") {
    return {
      tone: "success" as const,
      message: `เชื่อมร้าน TikTok สำเร็จ ${readParam(params, "shops") ?? "1"} ร้าน`,
    };
  }
  if (status === "denied") {
    return { tone: "danger" as const, message: "ร้านไม่อนุมัติสิทธิ์ให้แอป — ลองเชื่อมใหม่ได้" };
  }
  if (status === "bad_state") {
    return { tone: "danger" as const, message: "คำขอยืนยันไม่ถูกต้อง (state ไม่ตรง) — เริ่มเชื่อมใหม่จากปุ่มในหน้านี้" };
  }
  if (status === "no_code") {
    return { tone: "danger" as const, message: "TikTok ไม่ได้ส่ง code กลับมา — เริ่มเชื่อมใหม่" };
  }
  if (status === "missing_config") {
    return { tone: "warning" as const, message: "ยังไม่ได้กรอก App Key / App Secret / Service ID" };
  }
  if (status === "no_shop") {
    return { tone: "warning" as const, message: "อนุมัติแล้วแต่ไม่พบร้านที่ผูกกับแอป" };
  }
  return { tone: "danger" as const, message: readParam(params, "message") ?? "เชื่อมต่อไม่สำเร็จ" };
}

export default async function PlatformSyncPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activePlatform = readPlatform(params.platform);
  const selectedShop = readParam(params, "shop") ?? undefined;
  const flash = buildFlash(params);

  const [config, accounts, analytics] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(TIKTOK_PLATFORM),
    getTikTokAnalytics(30, selectedShop),
  ]);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · Shopee (ผ่าน Open API)"
        title="ดึงข้อมูลจากแพลตฟอร์ม"
        description="ยอดขาย ค่าธรรมเนียม ยอดโอน และสถานะพัสดุ ที่ดึงตรงจาก API — แยกแท็บตามแพลตฟอร์ม"
        actions={<Badge variant="warning">กำลังพัฒนา</Badge>}
      />

      {flash ? (
        <Card
          variant={flash.tone === "success" ? "success" : flash.tone === "danger" ? "danger" : "warning"}
          padding="padded"
          className="mb-4 text-[13.5px] leading-6"
          role="status"
        >
          {flash.message}
        </Card>
      ) : null}

      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3"
        role="tablist"
        aria-label="แพลตฟอร์ม"
      >
        <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
          {PLATFORM_TABS.map((tab) => {
            const active = tab.key === activePlatform;
            const href = tab.key === "tiktok" ? "/platform" : `/platform?platform=${tab.key}`;
            return (
              <Link
                key={tab.key}
                href={href}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <p className="min-w-0 text-xs text-[#64748b]">
          {PLATFORM_TABS.find((tab) => tab.key === activePlatform)?.hint}
        </p>
      </div>

      {activePlatform === "tiktok" ? (
        <section aria-label="แดชบอร์ด TikTok Shop" className="flex min-w-0 flex-col gap-4">
          {accounts.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-muted-foreground">ดู:</span>
              <Link
                href="/platform"
                className={
                  selectedShop
                    ? "rounded-full border border-border px-3 py-1"
                    : "rounded-full bg-slate-900 px-3 py-1 font-bold text-white"
                }
              >
                ทุกร้านรวมกัน
              </Link>
              {accounts.map((account) => (
                <Link
                  key={account.accountKey}
                  href={`/platform?shop=${encodeURIComponent(account.accountKey)}`}
                  className={
                    selectedShop === account.accountKey
                      ? "rounded-full bg-slate-900 px-3 py-1 font-bold text-white"
                      : "rounded-full border border-border px-3 py-1"
                  }
                >
                  {account.shopName ?? account.accountKey}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" asChild>
              <Link href="/platform/orders">ดูรายละเอียดรายออเดอร์</Link>
            </Button>
            <span className="text-[12px] text-muted-foreground">
              ค้นหาเลขคำสั่งซื้อ · กรองตามสถานะ · เปิดดูสินค้าและยอดเงินทีละออเดอร์
            </span>
            <PlatformAutoRefresh seconds={60} />
          </div>

          <PlatformDashboardView analytics={analytics} />
        </section>
      ) : null}

      {activePlatform === "shopee" ? (
        <section aria-label="แดชบอร์ด Shopee" className="flex min-w-0 flex-col gap-4">
          <EmptyState
            icon={<IconReceipt size={22} aria-hidden="true" />}
            title="Shopee ยังไม่เชื่อมต่อ"
            description="การเชื่อม Shopee ต้องใช้แอปประเภท Seller In-house System และร้านต้องเข้าเงื่อนไข Mall หรือ Managed seller ก่อน — ยังไม่เริ่มตามที่ตกลง"
          />

          <Card variant="info" padding="padded" className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-[14.5px] font-bold">
              <IconInfo size={15} aria-hidden="true" className="text-[#1d4ed8]" />
              สิ่งที่จะได้เมื่อเชื่อม Shopee
            </h2>
            <ul className="ml-4 list-disc text-[13px] leading-6 text-muted-foreground">
              <li>ยอดโอนต่อออเดอร์ + ค่าธรรมเนียมแยกรายการ (escrow detail)</li>
              <li>ยอดโอนที่ปล่อยจริงจาก Income API (≤14 วันต่อครั้ง)</li>
              <li>รายการปรับปรุง (adjustment) จาก wallet transaction</li>
              <li>สถานะพัสดุ + tracking และคำขอคืนเงิน</li>
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
