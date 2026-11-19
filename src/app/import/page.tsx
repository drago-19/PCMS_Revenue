import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { TableLoadingBoundary } from "@/components/TableLoadingBoundary";
import { UploadCompletenessCalendar } from "@/components/UploadCompletenessCalendar";
import KeepScrollOnNavigate from "@/components/KeepScrollOnNavigate";
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
    shop?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const mode: UploadDateMode = sp.mode === "paid" ? "paid" : "created";
  const shop = (sp.shop ?? "all").trim();

  const report = await getDailyUploadCompleteness({
    year: sp.year,
    month: sp.month,
    mode,
    shop,
  });

  // ไฟล์รายได้เป็นรอบชำระ ส่วนออเดอร์มีวันที่สร้างของตัวเอง — ต้องสลับมุมมองได้
  // ไม่งั้นไฟล์ที่จ่ายวันที่ 19 แต่ออเดอร์สร้างวันที่ 14-17 จะไม่โผล่ในวันที่ 19
  const modeHref = (nextMode: UploadDateMode) => {
    const params = new URLSearchParams();
    if (sp.year) params.set("year", sp.year);
    if (sp.month) params.set("month", sp.month);
    if (shop && shop !== "all") params.set("shop", shop);
    if (nextMode === "paid") params.set("mode", "paid");
    const qs = params.toString();
    return qs ? `/import?${qs}` : "/import";
  };

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="TikTok Shop, Shopee & Facebook · นำเข้าและแมปข้อมูล 3 ไฟล์"
        title="หมวดอัปโหลดไฟล์รายได้ & รายการสินค้า"
        description="รองรับทั้งไฟล์ .xlsx และ .csv จากทั้ง 3 ส่วน: (1) ไฟล์ออเดอร์ใน shipnity  (2) ไฟล์รายได้ TikTok Shop / ไฟล์รายได้ Shopee (Shopee Settlement)  (3) ไฟล์สินค้าในออเดอร์ shipnity (รองรับทั้งช่องทาง TikTok, Shopee และ Facebook)"
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
            อัปโหลดไฟล์รายได้ TikTok Shop, ไฟล์รายได้ Shopee (Shopee Settlement),
            ไฟล์ออเดอร์ใน shipnity และไฟล์สินค้าในออเดอร์ shipnity
            ระบบจะตรวจสอบชนิดไฟล์และเชื่อมข้อมูลเข้าด้วยกันให้อัตโนมัติ
          </p>
          <UploadForm />
        </Card>
      </div>

      <KeepScrollOnNavigate signature={`${mode}|${report.year}|${report.month}|${shop}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-[#64748b]">นับตาม</span>
        <Button asChild size="sm" variant={mode === "created" ? "default" : "outline"}>
          <Link
            href={modeHref("created")}
            scroll={false}
            aria-current={mode === "created" ? "page" : undefined}
          >
            วันที่สร้างออเดอร์
          </Link>
        </Button>
        <Button asChild size="sm" variant={mode === "paid" ? "default" : "outline"}>
          <Link
            href={modeHref("paid")}
            scroll={false}
            aria-current={mode === "paid" ? "page" : undefined}
          >
            วันชำระเงิน
          </Link>
        </Button>
      </div>

      <TableLoadingBoundary
        rows={8}
        columns={4}
        label="กำลังโหลดปฏิทินความครบถ้วนของไฟล์รายได้"
      >
        <UploadCompletenessCalendar report={report} />
      </TableLoadingBoundary>
      </KeepScrollOnNavigate>
    </div>
  );
}
