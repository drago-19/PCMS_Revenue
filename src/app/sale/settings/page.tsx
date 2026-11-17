import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { ShopeeConnectCard } from "@/components/ShopeeConnectCard";
import { TikTokConnectCard } from "@/components/TikTokConnectCard";
import { SaleHeader } from "@/components/sale/SaleHeader";
import { IconCheckCircle, IconInfo } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  getActiveShopId,
  getPlatformConfig,
  getWebhookRegisteredAt,
  listPlatformAccounts,
  SHOPEE_PLATFORM,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "ฝ่ายขาย · เชื่อมต่อร้านค้า" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function read(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * หน้าตั้งค่าของฝ่ายขาย — มีเฉพาะการเชื่อมต่อร้านค้า
 * แยกจาก /settings ของ Dragon19 โดยสิ้นเชิง (ไม่แตะหน้าและแบบฟอร์มของบริษัท/เอกสาร)
 */
export default async function SaleSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestHost = (await headers()).get("host") ?? "";
  const hostIsLocal =
    requestHost.startsWith("localhost") ||
    requestHost.startsWith("127.0.0.1") ||
    requestHost.startsWith("0.0.0.0");

  const [platformConfig, tiktokAccounts, shopeeAccounts, tiktokActiveShopId, tiktokWebhookRegisteredAt, shopeeActiveShopId] =
    await Promise.all([
      getPlatformConfig(),
      listPlatformAccounts(TIKTOK_PLATFORM),
      listPlatformAccounts(SHOPEE_PLATFORM),
      getActiveShopId(TIKTOK_PLATFORM),
      getWebhookRegisteredAt(TIKTOK_PLATFORM),
      getActiveShopId(SHOPEE_PLATFORM),
    ]);

  // ผลลัพธ์จากการเชื่อม Shopee กลับมา (query ที่ OAuth ต่อท้ายให้)
  const shopeeParam = read(params, "shopee");
  let notice: { tone: "ok" | "error"; text: string } | null = null;
  if (shopeeParam === "connected") {
    const shop = read(params, "shop");
    notice = { tone: "ok", text: `เชื่อมต่อร้าน Shopee${shop ? ` (${shop})` : ""} สำเร็จแล้ว` };
  } else if (shopeeParam) {
    const map: Record<string, string> = {
      missing_config: "กรุณากรอก Partner ID และ Partner Key ของ Shopee ก่อน",
      bad_state: "คำขอ OAuth หมดอายุหรือ state ไม่ตรง — ลองกดเชื่อมใหม่อีกครั้ง",
      no_code: "Shopee ไม่ได้ส่ง code หรือ shop_id กลับมา",
      error: read(params, "message") || "เชื่อมต่อ Shopee ไม่สำเร็จ",
    };
    notice = { tone: "error", text: map[shopeeParam] ?? shopeeParam };
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SaleHeader
        eyebrow="ฝ่ายขาย"
        title="เชื่อมต่อร้านค้า"
        description="เชื่อมร้าน TikTok Shop และ Shopee — ร้านที่เชื่อมแล้วจะดึงออเดอร์และสต็อกเข้ามาที่หน้าฝ่ายขาย"
      />

      {notice ? (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium",
            notice.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {notice.tone === "ok" ? (
            <IconCheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <IconInfo className="h-4 w-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
        <TikTokConnectCard
          canEditConfig={false}
          hostIsLocal={hostIsLocal}
          activeShopId={tiktokActiveShopId}
          config={{
            configured: Boolean(platformConfig.tiktok),
            appKey: platformConfig.tiktok?.appKey ?? null,
            serviceId: platformConfig.tiktok?.serviceId ?? null,
            webhookRegisteredAt: tiktokWebhookRegisteredAt,
            accounts: tiktokAccounts.map((account) => ({
              accountKey: account.accountKey,
              shopName: account.shopName,
              shopCipher: account.shopCipher,
              region: account.region,
              status: account.status,
              lastError: account.lastError,
              accessTokenExpiresAt: account.accessTokenExpiresAt,
              connectedAt: account.connectedAt,
            })),
          }}
        />

        <ShopeeConnectCard
          canEditConfig={false}
          hostIsLocal={hostIsLocal}
          activeShopId={shopeeActiveShopId}
          config={{
            configured: Boolean(platformConfig.shopee),
            partnerId: platformConfig.shopee?.partnerId ?? null,
            env: platformConfig.shopee?.env ?? "sandbox",
            redirectBaseUrl: platformConfig.shopee?.redirectBaseUrl ?? null,
            pushCallbackUrl: platformConfig.shopee
              ? `${(platformConfig.shopee.redirectBaseUrl ?? "https://revenue.goldpulse-ai.com").replace(/\/+$/, "")}/api/platform/shopee/webhook?token=${createHmac("sha256", platformConfig.shopee.partnerKey).update("shopee-push").digest("hex").slice(0, 32)}`
              : null,
            accounts: shopeeAccounts.map((account) => ({
              accountKey: account.accountKey,
              shopName: account.shopName,
              shopCipher: account.shopCipher,
              region: account.region,
              status: account.status,
              lastError: account.lastError,
              accessTokenExpiresAt: account.accessTokenExpiresAt,
              connectedAt: account.connectedAt,
            })),
          }}
        />
      </div>
    </div>
  );
}
