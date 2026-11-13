import { PageHeader } from "@/components/PageHeader";
import { PlatformProductsView } from "@/components/platform/PlatformProductsView";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformPeriodBar } from "@/components/platform/PlatformPeriodBar";
import { PlatformDetail } from "@/components/platform/PlatformDetailSlot";
import { PlatformBody, PlatformSwitcher } from "@/components/platform/PlatformScope";
import { getTikTokAnalytics } from "@/lib/platform/analytics";
import { detailParam, hrefWithDetail } from "@/lib/platform/details";
import { readPlatform } from "@/lib/platform/platforms";
import { getTikTokOps } from "@/lib/platform/ops";
import { thaiRange } from "@/lib/platform/period";
import { listPlatformAccounts, TIKTOK_PLATFORM } from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "แพลตฟอร์ม · สินค้าและเหตุผล" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function read(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedShop = read(params, "shop");
  const fromParam = read(params, "from");
  const toParam = read(params, "to");
  const platform = readPlatform(read(params, "platform"));

  const [accounts, analytics, ops] = await Promise.all([
    listPlatformAccounts(TIKTOK_PLATFORM),
    getTikTokAnalytics({ from: fromParam, to: toParam, rangeDays: 30, shopId: selectedShop }),
    getTikTokOps({ from: fromParam, to: toParam, shopId: selectedShop }),
  ]);

  return (
    <div className="workspace-page flex min-w-0 flex-col gap-4">
      <PageHeader
        eyebrow="TikTok Shop"
        title="สินค้าและเหตุผล"
        description={`สินค้าที่ทำยอด ราคาที่ขายได้จริง และเหตุผลที่ออเดอร์ถูกยกเลิก · ${thaiRange(ops.range.from, ops.range.to)}`}
      />

      <PlatformSwitcher
        platform={platform}
        basePath="/platform/products"
        from={fromParam}
        to={toParam}
        shop={selectedShop}
      />

      <PlatformBody platform={platform}>
        <PlatformNav active="products" from={fromParam} to={toParam} shop={selectedShop} />

        <PlatformPeriodBar
          basePath="/platform/products"
          from={fromParam}
          to={toParam}
          shop={selectedShop}
          accounts={accounts.map((account) => ({ accountKey: account.accountKey, shopName: account.shopName }))}
        />

        {analytics.hasData ? (
          <PlatformProductsView
            analytics={analytics}
            products={ops.products}
            price={ops.price}
            detailHref={(kind, value, label) =>
              hrefWithDetail("/platform/products", params, detailParam(kind, value, label))
            }
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">ยังไม่มีข้อมูลในช่วงนี้ — เลือกช่วงเวลาอื่นหรือดึงข้อมูลก่อน</p>
        )}
      </PlatformBody>

      <PlatformDetail
        raw={read(params, "detail")}
        basePath="/platform/products"
        params={params}
        from={fromParam}
        to={toParam}
        shopId={selectedShop}
      />
    </div>
  );
}
