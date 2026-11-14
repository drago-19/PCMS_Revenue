import Link from "next/link";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { DocumentSettingsClient } from "@/components/DocumentSettingsClient";
import { PageHeader } from "@/components/PageHeader";
import { ShipnityConnectForm } from "@/components/ShipnityConnectForm";
import { ShopeeConnectCard } from "@/components/ShopeeConnectCard";
import { TikTokConnectCard } from "@/components/TikTokConnectCard";
import { IconCheckCircle, IconInfo } from "@/components/icons";
import { cn } from "@/lib/utils";
import { getActiveCompanyId } from "@/lib/db";
import {
  getActiveShopId,
  getPlatformConfig,
  listPlatformAccounts,
  SHOPEE_PLATFORM,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";
import { getCompanyDefaultSeller, getDocumentSettings } from "@/lib/settings";
import { getShipnityConnectionStatus } from "@/lib/shipnity/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "ตั้งค่าเอกสารและบริษัท" };

const TABS = [
  {
    key: "platforms",
    label: "เชื่อมต่อแพลตฟอร์ม",
    hint: "TikTok Shop · Shopee",
  },
  {
    key: "shipnity",
    label: "เชื่อมต่อ Shipnity",
    hint: "บัญชีร้านสำหรับหน้าออเดอร์รอแพ็ค",
  },
  {
    key: "company",
    label: "ข้อมูลบริษัท / เอกสาร",
    hint: "ชื่อ ที่อยู่ เลขภาษี และรูปแบบใบกำกับ",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function readTab(value: string | string[] | undefined): TabKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const found = TABS.find((tab) => tab.key === raw);
  // ค่าเริ่มต้นคือหน้าข้อมูลบริษัท/เอกสาร เพราะเป็นจุดประสงค์หลักของหน้านี้
  return found?.key ?? "company";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeTab = readTab(params.tab);

  const companyId = await getActiveCompanyId();
  const settings = await getDocumentSettings(undefined, true);
  const defaultSettings = getCompanyDefaultSeller(companyId);
  const shipnity = await getShipnityConnectionStatus(companyId);
  const requestHost = (await headers()).get("host") ?? "";
  const hostIsLocal =
    requestHost.startsWith("localhost") ||
    requestHost.startsWith("127.0.0.1") ||
    requestHost.startsWith("0.0.0.0");

  const [platformConfig, tiktokAccounts, shopeeAccounts, tiktokActiveShopId] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(TIKTOK_PLATFORM),
    listPlatformAccounts(SHOPEE_PLATFORM),
    getActiveShopId(TIKTOK_PLATFORM),
  ]);

  const activeShopeeShopId = await getActiveShopId(SHOPEE_PLATFORM);
  const shopeeParam = Array.isArray(params.shopee) ? params.shopee[0] : params.shopee;
  const shopeeMsgParam = Array.isArray(params.message) ? params.message[0] : params.message;
  const shopeeShopParam = Array.isArray(params.shop) ? params.shop[0] : params.shop;
  let shopeeNotice: { tone: "ok" | "error"; text: string } | null = null;
  if (shopeeParam === "connected") {
    shopeeNotice = {
      tone: "ok",
      text: `เชื่อมต่อร้าน Shopee${shopeeShopParam ? ` (${shopeeShopParam})` : ""} สำเร็จแล้ว`,
    };
  } else if (shopeeParam) {
    const map: Record<string, string> = {
      missing_config: "กรุณากรอก Partner ID และ Partner Key ของ Shopee ก่อน",
      bad_state: "คำขอ OAuth หมดอายุหรือ state ไม่ตรง — ลองกดเชื่อมใหม่อีกครั้ง",
      no_code: "Shopee ไม่ได้ส่ง code หรือ shop_id กลับมา",
      error: shopeeMsgParam || "เชื่อมต่อ Shopee ไม่สำเร็จ",
    };
    shopeeNotice = { tone: "error", text: map[shopeeParam] ?? shopeeParam };
  }

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="PCMS Revenue · Document & Company Settings"
        title="ตั้งค่าเอกสาร / ข้อมูลบริษัท"
        description="แยกเป็น 3 แท็บ: การเชื่อมต่อแพลตฟอร์ม การเชื่อมต่อ Shipnity และข้อมูลบริษัทที่พิมพ์ลงเอกสาร"
      />

      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3"
        role="tablist"
        aria-label="หมวดการตั้งค่า"
      >
        <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            const href = tab.key === "company" ? "/settings" : `/settings?tab=${tab.key}`;
            return (
              <Link
                key={tab.key}
                href={href}
                scroll={false}
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        <p className="min-w-0 text-xs text-[#64748b]">
          {TABS.find((tab) => tab.key === activeTab)?.hint}
        </p>
      </div>

      {activeTab === "platforms" ? (
        <section
          aria-label="เชื่อมต่อแพลตฟอร์ม"
          className="flex flex-col gap-3"
        >
          {shopeeNotice ? (
            <div
              role="status"
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium",
                shopeeNotice.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800",
              )}
            >
              {shopeeNotice.tone === "ok" ? (
                <IconCheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <IconInfo className="h-4 w-4 shrink-0" />
              )}
              <span>{shopeeNotice.text}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
            <TikTokConnectCard
              hostIsLocal={hostIsLocal}
              activeShopId={tiktokActiveShopId}
              config={{
                configured: Boolean(platformConfig.tiktok),
                appKey: platformConfig.tiktok?.appKey ?? null,
                serviceId: platformConfig.tiktok?.serviceId ?? null,
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
              hostIsLocal={hostIsLocal}
              activeShopId={activeShopeeShopId}
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
        </section>
      ) : null}

      {activeTab === "shipnity" ? (
        <section aria-label="เชื่อมต่อ Shipnity" className="flex flex-col gap-3">
          <p className="text-xs leading-6 text-muted-foreground">
            ล็อกอินด้วยบัญชี Shipnity ของบริษัทนี้ — เพิ่มได้หลายบัญชี (หลายร้าน)
            หน้า “ออเดอร์รอแพ็ค” จะดึงออเดอร์จากทุกบัญชีที่เชื่อมไว้
          </p>
          <ShipnityConnectForm accounts={shipnity.accounts} source={shipnity.source} />
        </section>
      ) : null}

      {activeTab === "company" ? (
        <section aria-label="ข้อมูลบริษัทและเอกสาร" className="flex flex-col gap-3">
          <p className="text-xs leading-6 text-muted-foreground">
            ข้อมูลนี้พิมพ์ลงบิลและใบกำกับภาษีของบริษัทที่กำลังใช้งานอยู่
          </p>
          <DocumentSettingsClient
            initialSettings={settings}
            defaultSettings={defaultSettings}
          />
        </section>
      ) : null}
    </div>
  );
}
