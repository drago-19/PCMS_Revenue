import Link from "next/link";
import { DocumentSettingsClient } from "@/components/DocumentSettingsClient";
import { PageHeader } from "@/components/PageHeader";
import { ShipnityConnectForm } from "@/components/ShipnityConnectForm";
import { TikTokConnectCard } from "@/components/TikTokConnectCard";
import { IconInfo, IconReceipt } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

const SECTIONS = [
  { id: "platforms", label: "เชื่อมต่อแพลตฟอร์ม" },
  { id: "shipnity", label: "เชื่อมต่อ Shipnity" },
  { id: "company", label: "ข้อมูลบริษัท / เอกสาร" },
] as const;

export default async function SettingsPage() {
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
        description="การเชื่อมต่อแพลตฟอร์มและ Shipnity ข้อมูลบริษัทที่ขึ้นบนเอกสาร ชื่อ ที่อยู่ เลขผู้เสียภาษี รหัสคำนำหน้าแยกตามช่องทาง ขนาดกระดาษ และหัวข้อบนใบกำกับภาษี"
      />

      <div className="flex flex-col gap-6 min-[1100px]:grid min-[1100px]:grid-cols-[190px_minmax(0,1fr)] min-[1100px]:items-start min-[1100px]:gap-8">
        <nav aria-label="สารบัญการตั้งค่า" className="min-[1100px]:sticky min-[1100px]:top-4">
          <ul className="flex list-none flex-wrap gap-2 p-0 min-[1100px]:flex-col min-[1100px]:gap-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-[38px] items-center rounded-lg px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-10">
          <section id="platforms" className="flex scroll-mt-4 flex-col gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-foreground">
                1. เชื่อมต่อแพลตฟอร์ม
              </h2>
              <p className="text-xs leading-6 text-muted-foreground">
                เก็บ key ของแอปและ token ของร้านไว้ที่บริษัทนี้ — App Secret ถูกเข้ารหัสก่อนลงฐานข้อมูล
                และไม่แสดงกลับบนหน้าจอ ข้อมูลที่ดึงได้จะไปแสดงที่หน้า{" "}
                <Link href="/platform" className="font-bold underline underline-offset-2">
                  ดึงข้อมูลจากแพลตฟอร์ม
                </Link>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
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
                  <span className="min-w-0">
                    ยังไม่เริ่มงานฝั่ง Shopee — เริ่มจาก TikTok ก่อนตามที่ตกลง
                  </span>
                </p>
              </Card>
            </div>
          </section>

          <section id="shipnity" className="flex scroll-mt-4 flex-col gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-foreground">
                2. เชื่อมต่อ Shipnity
              </h2>
              <p className="text-xs leading-6 text-muted-foreground">
                ล็อกอินด้วยบัญชี Shipnity ของบริษัทนี้ — เพิ่มได้หลายบัญชี (หลายร้าน)
                หน้า “ออเดอร์รอแพ็ค” จะดึงออเดอร์จากทุกบัญชีที่เชื่อมไว้
              </p>
            </div>
            <ShipnityConnectForm accounts={shipnity.accounts} source={shipnity.source} />
          </section>

          <section id="company" className="flex scroll-mt-4 flex-col gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-foreground">
                3. ข้อมูลบริษัท / เอกสาร
              </h2>
              <p className="text-xs leading-6 text-muted-foreground">
                ข้อมูลนี้พิมพ์ลงบิลและใบกำกับภาษีของบริษัทที่กำลังใช้งานอยู่
              </p>
            </div>
            <DocumentSettingsClient
              initialSettings={settings}
              defaultSettings={defaultSettings}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
