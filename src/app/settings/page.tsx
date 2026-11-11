import { DocumentSettingsClient } from "@/components/DocumentSettingsClient";
import { PageHeader } from "@/components/PageHeader";
import { ShipnityConnectForm } from "@/components/ShipnityConnectForm";
import { getActiveCompanyId } from "@/lib/db";
import { getCompanyDefaultSeller, getDocumentSettings } from "@/lib/settings";
import { getShipnityConnectionStatus } from "@/lib/shipnity/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "ตั้งค่าเอกสารและบริษัท" };

export default async function SettingsPage() {
  const companyId = await getActiveCompanyId();
  const settings = await getDocumentSettings(undefined, true);
  const defaultSettings = getCompanyDefaultSeller(companyId);
  const shipnity = await getShipnityConnectionStatus(companyId);

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="PCMS Revenue · Document & Company Settings"
        title="ตั้งค่าเอกสาร / ข้อมูลบริษัท"
        description="ปรับชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี รหัสคำนำหน้าแยกตามแพลตฟอร์ม ขนาดกระดาษเริ่มต้น หัวข้อที่แสดงบนใบกำกับภาษี และการเชื่อมต่อ Shipnity ของบริษัทนี้"
      />

      <section className="flex flex-col gap-2.5">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">เชื่อมต่อ Shipnity</h2>
          <p className="text-xs text-muted-foreground">
            ล็อกอินด้วยบัญชี Shipnity ของบริษัทนี้ — เพิ่มได้หลายบัญชี (หลายร้าน)
            หน้า “ออเดอร์รอแพ็ค” จะดึงออเดอร์จากทุกบัญชีที่เชื่อมไว้
          </p>
        </div>
        <ShipnityConnectForm accounts={shipnity.accounts} source={shipnity.source} />
      </section>

      <DocumentSettingsClient
        initialSettings={settings}
        defaultSettings={defaultSettings}
      />
    </div>
  );
}
