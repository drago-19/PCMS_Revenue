import { DocumentSettingsClient } from "@/components/DocumentSettingsClient";
import { PageHeader } from "@/components/PageHeader";
import { getActiveCompanyId } from "@/lib/db";
import { getCompanyDefaultSeller, getDocumentSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "ตั้งค่าเอกสารและบริษัท" };

export default async function SettingsPage() {
  const companyId = await getActiveCompanyId();
  const settings = await getDocumentSettings(undefined, true);
  const defaultSettings = getCompanyDefaultSeller(companyId);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="PCMS Revenue · Document & Company Settings"
        title="ตั้งค่าเอกสาร / ข้อมูลบริษัท"
        description="ปรับชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี อัตรา VAT ขนาดกระดาษเริ่มต้น และหัวข้อที่แสดงบนใบกำกับภาษี"
      />
      <DocumentSettingsClient
        initialSettings={settings}
        defaultSettings={defaultSettings}
      />
    </div>
  );
}
