import { PageHeader } from "@/components/PageHeader";
import { PlatformOverviewView } from "@/components/PlatformDashboard";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { PlatformDetail } from "@/components/platform/PlatformDetailSlot";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getTikTokAnalytics } from "@/lib/platform/analytics";
import { detailParam, hrefWithDetail } from "@/lib/platform/details";
import { readPlatform, platformDbName, platformTab } from "@/lib/platform/platforms";
import { getActiveShopId, getConnectedPlatforms, listPlatformAccounts } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · ภาพรวม" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
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

export default async function PlatformOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // ไม่ระบุร้าน = ใช้ร้านที่เลือกไว้ในหน้าตั้งค่า (โหมดจริง/ทดสอบ) ไม่ใช่รวมทุกร้าน
  const selectedShop = readParam(params, "shop") ?? (await getActiveShopId("TikTok")) ?? undefined;
  const fromParam = readParam(params, "from");
  const toParam = readParam(params, "to");
  const flash = buildFlash(params);
  const platform = readPlatform(readParam(params, "platform"));
  const dbPlatform = platformDbName(platform);

  const [accounts, connectedPlatforms, analytics] = await Promise.all([
    listPlatformAccounts(dbPlatform),
    getConnectedPlatforms(),
    getTikTokAnalytics({ from: fromParam, to: toParam, rangeDays: 30, shopId: selectedShop, platform: dbPlatform }),
  ]);
  const isConnected = connectedPlatforms.includes(platform);

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow={`${platformTab(platform).label} (ผ่าน Open API)`}
        title="แพลตฟอร์ม"
        description="ยอดขาย ค่าธรรมเนียม และยอดโอน ที่ดึงตรงจาก API — ตัวเลขคำนวณจากฐานข้อมูลของเรา ไม่ได้ยิงถาม API ทุกครั้งที่เปิดหน้า"
        actions={<Badge variant="warning">กำลังพัฒนา</Badge>}
      />

      {flash ? (
        <Card
          variant={flash.tone === "success" ? "success" : flash.tone === "danger" ? "danger" : "warning"}
          padding="padded"
          className="text-[13.5px] leading-6"
          role="status"
        >
          {flash.message}
        </Card>
      ) : null}

      <PlatformSwitcher
        platform={platform}
        basePath="/platform"
        from={fromParam}
        to={toParam}
        shop={selectedShop}
        connectedPlatforms={connectedPlatforms}
      />

      <PlatformBody platform={platform} connected={isConnected}>
        <PlatformNav active="overview" from={fromParam} to={toParam} shop={selectedShop} platform={platform} />

        <PlatformPeriodBar
          basePath="/platform"
          from={fromParam}
          to={toParam}
          shop={selectedShop}
          platform={platform}
          accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
          showSync
          autoRefreshSeconds={30}
          lastSyncedAt={analytics.lastSyncedAt}
        />

        <PlatformOverviewView
          analytics={analytics}
          detailHref={(_kind, value) => hrefWithDetail("/platform", params, detailParam("kpi", value))}
        />
      </PlatformBody>

      <PlatformDetail
        raw={readParam(params, "detail")}
        basePath="/platform"
        params={params}
        from={fromParam}
        to={toParam}
        shopId={selectedShop}
        platform={dbPlatform}
      />
    </div>
  );
}
