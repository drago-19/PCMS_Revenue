import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { UploadCompletenessCalendar } from "@/components/UploadCompletenessCalendar";
import { UploadForm } from "@/components/UploadForm";
import { IconHistory, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getDailyUploadCompleteness,
  type UploadDateMode,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "อัปโหลดรายได้" };

export default async function ImportPage({
  searchParams,
}: {
  searchParams?: Promise<{
    year?: string;
    month?: string;
    mode?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const mode: UploadDateMode = sp.mode === "paid" ? "paid" : "created";

  const report = await getDailyUploadCompleteness({
    year: sp.year,
    month: sp.month,
    mode,
  });

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop, Shopee & Facebook · นำเข้าและแมปข้อมูล 3 ไฟล์"
        title="หมวดอัปโหลดไฟล์รายได้ & รายการสินค้า"
        description="รองรับทั้งไฟล์ .xlsx และ .csv จากทั้ง 3 ส่วน: (1) ไฟล์ออเดอร์ใน shipnity  (2) ไฟล์รายได้ TikTok Shop  (3) ไฟล์สินค้าในออเดอร์ shipnity (รองรับทั้งช่องทาง TikTok, Shopee และ Facebook)"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/history">
                <IconHistory size={17} /> ประวัติไฟล์ที่นำเข้า
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/bills">
                <IconReceipt size={17} /> ดูบิลทั้งหมด
              </Link>
            </Button>
          </>
        }
      />

      <div className="import-grid">
        <Card padding="padded" className="card-pad w-full">
          <h2 className="card-title">
            นำเข้าไฟล์ .xlsx หรือ .csv (เลือกพร้อมกันได้)
          </h2>
          <p className="card-sub">
            อัปโหลดไฟล์รายได้ TikTok Shop, ไฟล์ออเดอร์ใน shipnity
            และไฟล์สินค้าในออเดอร์ shipnity (SKU)
            ระบบจะตรวจสอบชนิดไฟล์และเชื่อมข้อมูลเข้าด้วยกันให้อัตโนมัติ
          </p>
          <UploadForm />
        </Card>
      </div>

      <UploadCompletenessCalendar report={report} />
    </div>
  );
}
