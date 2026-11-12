import { PlatformSetupPanel } from "@/components/PlatformSetupPanel";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  getPlatformConfig,
  listPlatformAccounts,
  TIKTOK_PLATFORM,
} from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "ดึงข้อมูลจากแพลตฟอร์ม" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** ข้อความแจ้งผลหลังกลับจากหน้า authorize ของ TikTok */
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
    return {
      tone: "danger" as const,
      message: "คำขอยืนยันไม่ถูกต้อง (state ไม่ตรง) — เริ่มเชื่อมใหม่จากปุ่มในหน้านี้",
    };
  }
  if (status === "no_code") {
    return { tone: "danger" as const, message: "TikTok ไม่ได้ส่ง code กลับมา — เริ่มเชื่อมใหม่" };
  }
  if (status === "missing_config") {
    return {
      tone: "warning" as const,
      message: "ยังไม่ได้กรอก App Key / App Secret / Service ID",
    };
  }
  if (status === "no_shop") {
    return {
      tone: "warning" as const,
      message: "อนุมัติแล้วแต่ไม่พบร้านที่ผูกกับแอป — ตรวจว่าใช้บัญชีร้านที่ถูกต้อง",
    };
  }
  return {
    tone: "danger" as const,
    message: readParam(params, "message") ?? "เชื่อมต่อไม่สำเร็จ",
  };
}

export default async function PlatformSyncPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [config, accounts] = await Promise.all([
    getPlatformConfig(),
    listPlatformAccounts(TIKTOK_PLATFORM),
  ]);
  const flash = buildFlash(params);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop · Shopee (ผ่าน Open API)"
        title="ดึงข้อมูลจากแพลตฟอร์ม"
        description="ดึงออเดอร์ ยอดโอน ค่าธรรมเนียม และสถานะขนส่งตรงจาก API ของแพลตฟอร์ม — เริ่มจาก TikTok Shop"
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

      <PlatformSetupPanel
        tiktok={{
          configured: Boolean(config.tiktok),
          appKey: config.tiktok?.appKey ?? null,
          serviceId: config.tiktok?.serviceId ?? null,
          accounts: accounts.map((account) => ({
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
  );
}
