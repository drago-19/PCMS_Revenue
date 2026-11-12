import Link from "next/link";
import { DocumentSettingsClient } from "@/components/DocumentSettingsClient";
import { PageHeader } from "@/components/PageHeader";
import { ShipnityConnectForm } from "@/components/ShipnityConnectForm";
import { TikTokConnectCard } from "@/components/TikTokConnectCard";
import { IconInfo, IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getActiveCompanyId } from "@/lib/db";
import {
  getPlatformConfig,
  listPlatformAccounts,
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
  return found?.key ?? "platforms";
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
  const [platformConfig, tiktokAccounts] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(TIKTOK_PLATFORM),
  ]);

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
            const href = tab.key === "platforms" ? "/settings" : `/settings?tab=${tab.key}`;
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
          className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2"
        >
          <TikTokConnectCard
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

          <Card padding="padded" className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
                >
                  <IconReceipt size={16} />
                </span>
                <span className="truncate text-[15px] font-bold">Shopee</span>
              </div>
              <Badge variant="neutral">ยังไม่เชื่อมต่อ</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
              <div className="min-w-0">
                <dt className="text-muted-foreground">ร้านที่เชื่อม</dt>
                <dd className="mono font-bold">0 ร้าน</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">ดึงล่าสุด</dt>
                <dd className="font-bold">ยังไม่มี</dd>
              </div>
              <div className="col-span-2 min-w-0 border-t border-border pt-2 text-muted-foreground">
                ใช้แอปประเภท Seller In-house System (ต้องขึ้น Live ก่อน)
              </div>
            </dl>

            <p className="flex items-start gap-1.5 text-[12.5px] leading-6 text-muted-foreground">
              <IconInfo size={14} aria-hidden="true" className="mt-1 shrink-0" />
              <span className="min-w-0">ยังไม่เริ่มงานฝั่ง Shopee — เริ่มจาก TikTok ก่อนตามที่ตกลง</span>
            </p>
          </Card>
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
