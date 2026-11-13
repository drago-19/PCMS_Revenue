import { PageHeader } from "@/components/PageHeader";
import { PlatformOpsView } from "@/components/platform/PlatformOpsView";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { PlatformDetail } from "@/components/platform/PlatformDetailSlot";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { detailParam, hrefWithDetail } from "@/lib/platform/details";
import { getTikTokOps } from "@/lib/platform/ops";
import { readPlatform } from "@/lib/platform/platforms";
import { thaiRange } from "@/lib/platform/period";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · งานที่ต้องทำ" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function read(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformOpsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedShop = read(params, "shop");
  const fromParam = read(params, "from");
  const toParam = read(params, "to");
  const platform = readPlatform(read(params, "platform"));

  const [accounts, ops] = await Promise.all([
    listPlatformAccounts(TIKTOK_PLATFORM),
    getTikTokOps({ from: fromParam, to: toParam, shopId: selectedShop }),
  ]);

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="TikTok Shop"
        title="งานที่ต้องทำ"
        description={`ออเดอร์ที่รอจัดส่ง รอขนรับ และการยกเลิกในงวด · ${thaiRange(ops.range.from, ops.range.to)}`}
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/platform/ops"
        from={fromParam}
        to={toParam}
        shop={selectedShop}
      />

      <PlatformBody platform={platform}>
        <PlatformNav active="ops" from={fromParam} to={toParam} shop={selectedShop} />

        <PlatformPeriodBar
          basePath="/platform/ops"
          from={fromParam}
          to={toParam}
          shop={selectedShop}
          accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
        />

        <PlatformOpsView
          ops={ops}
          detailHref={(kind, value) =>
            hrefWithDetail("/platform/ops", params, detailParam(kind as "status" | "initiator" | "province" | "kpi", value))
          }
        />
      </PlatformBody>

      <PlatformDetail
        raw={read(params, "detail")}
        basePath="/platform/ops"
        params={params}
        from={fromParam}
        to={toParam}
        shopId={selectedShop}
      />
    </div>
  );
}
