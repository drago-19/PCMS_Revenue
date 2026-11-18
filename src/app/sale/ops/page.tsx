import { SaleHeader } from "@/components/sale/SaleHeader";
import { SaleOpsView } from "@/components/sale/SaleOpsView";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { PlatformDetail } from "@/components/platform/PlatformDetailSlot";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { detailParam, hrefWithDetail } from "@/lib/platform/details";
import { getTikTokOps } from "@/lib/platform/ops";
import { platformDbName, platformTab, readPlatform } from "@/lib/platform/platforms";
import { thaiRange } from "@/lib/platform/period";
import { getActiveShopId, getConnectedPlatforms, listPlatformAccounts } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "ฝ่ายขาย · งานที่ต้องทำ" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function read(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformOpsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const fromParam = read(params, "from");
  const toParam = read(params, "to");
  const platform = readPlatform(read(params, "platform"));
  const dbPlatform = platformDbName(platform);
  // ร้านที่ระบุมาทาง URL ต้องเป็นร้านที่ยังแสดงอยู่ — ร้านที่ซ่อนแล้วห้ามเปิดดูข้อมูล
  const accounts = await listPlatformAccounts(dbPlatform);
  const requestedShop = read(params, "shop");
  const selectedShop =
    (requestedShop && accounts.some((account) => account.accountKey === requestedShop)
      ? requestedShop
      : null) ??
    (await getActiveShopId(dbPlatform)) ??
    accounts[0]?.accountKey ??
    undefined;

  const [connectedPlatforms, ops] = await Promise.all([
    getConnectedPlatforms(),
    getTikTokOps({ from: fromParam, to: toParam, shopId: selectedShop, platform: dbPlatform }),
  ]);

  if (accounts.length === 0) {
    return (
      <div className="workspace-page flex min-w-0 flex-col gap-4">
        <SaleHeader
          eyebrow={platformTab(platform).label}
          title="งานที่ต้องทำ"
          description="ยังไม่มีร้านที่แสดงอยู่"
        />
        <p className="text-[13px] text-muted-foreground">
          ร้านที่เชื่อมต่อถูกซ่อนไว้ — เปิดกลับได้ที่หน้าตั้งค่า
        </p>
      </div>
    );
  }

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <SaleHeader
        eyebrow={platformTab(platform).label}
        title="งานที่ต้องทำ"
        description={`คิวงานที่ต้องทำในงวด: รอจัดส่ง รอขนรับ และพัสดุที่ต้องตาม · ${thaiRange(ops.range.from, ops.range.to)}`}
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/sale/ops"
        from={fromParam}
        to={toParam}
        shop={selectedShop}
        connectedPlatforms={connectedPlatforms}
        tones="platform"
      />

      <PlatformBody platform={platform} connected={connectedPlatforms.includes(platform)}>
        <PlatformPeriodBar
          basePath="/sale/ops"
          from={fromParam}
          to={toParam}
          shop={selectedShop}
          platform={platform}
          accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
        />

        <SaleOpsView
          ops={ops}
          detailHref={(kind, value) =>
            hrefWithDetail("/sale/ops", params, detailParam(kind as "status" | "initiator" | "province" | "kpi", value))
          }
        />
      </PlatformBody>

      <PlatformDetail
        raw={read(params, "detail")}
        basePath="/sale/ops"
        params={params}
        from={fromParam}
        to={toParam}
        shopId={selectedShop}
        platform={dbPlatform}
      />
    </div>
  );
}
