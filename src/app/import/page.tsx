import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { UploadForm } from "@/components/UploadForm";
import { IconCheckCircle, IconHistory, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = { title: "อัปโหลดรายได้" };

export default async function ImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Multi-Channel · นำเข้าและแมปข้อมูล 3 ไฟล์"
        title="หมวดอัปโหลดไฟล์รายได้ & รายการสินค้า"
        description="รองรับทั้งไฟล์ .xlsx และ .csv จากทั้ง 3 ส่วน: (1) ไฟล์ออเดอร์ OMS  (2) ไฟล์รายได้ TikTok Shop  (3) ไฟล์รายการสินค้า OMS เพื่อแมปรหัสสินค้า (SKU) และแยกป้ายช่องทางอัตโนมัติ"
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
        <Card padding="padded" className="card-pad">
          <h2 className="card-title">นำเข้าไฟล์ .xlsx หรือ .csv (เลือกพร้อมกันได้)</h2>
          <p className="card-sub">
            อัปโหลดไฟล์รายได้ TikTok Shop, ไฟล์ออเดอร์รวมช่องทาง (OMS) และไฟล์รายการสินค้า (SKU) ระบบจะตรวจสอบชนิดไฟล์และเชื่อมข้อมูลเข้าด้วยกันให้อัตโนมัติ
          </p>
          <UploadForm />
        </Card>

        <Card padding="padded" className="card-pad side-notes">
          <div>
            <h3>การเชื่อมข้อมูลทั้ง 3 ไฟล์อัตโนมัติ</h3>
            <ul className="check-list">
              <li>
                <IconCheckCircle size={17} /> <strong>ไฟล์ที่ 1 (ออเดอร์ OMS):</strong> เชื่อมรหัสออเดอร์ (เช่น OF39) เข้ากับเลข Marketplace และแยกช่องทาง TikTok / Shopee / Facebook
              </li>
              <li>
                <IconCheckCircle size={17} /> <strong>ไฟล์ที่ 2 (รายได้ TikTok Shop):</strong> แจกแจงรายได้ ค่าธรรมเนียม และยอดโอนสุทธิรายคำสั่งซื้อ
              </li>
              <li>
                <IconCheckCircle size={17} /> <strong>ไฟล์ที่ 3 (รายการสินค้า OMS):</strong> ดึงรหัสสินค้า (SKU), ชื่อสินค้า, ราคาต่อชิ้น และที่อยู่ลูกค้าไปแสดงในใบกำกับภาษีทั้งแบบย่อและแบบเต็ม
              </li>
              <li>
                <IconCheckCircle size={17} /> รองรับการอัปโหลดสลับลำดับไฟล์ ระบบจะจับคู่ย้อนหลังให้ทันที
              </li>
            </ul>
          </div>

          <div>
            <h3>ถ้า TikTok เปลี่ยนรูปแบบ export</h3>
            <p className="muted">
              ระบบใช้การจับคู่หัวคอลัมน์แบบยืดหยุ่น (ตัดคำว่า “โดยประมาณ”, ชื่อไทย/อังกฤษ,
              สลับตำแหน่งคอลัมน์) คอลัมน์ที่ไม่รู้จักจะถูกเก็บและแจ้งเตือน
              พร้อมแสดงส่วนต่างในบิลถ้ายอดไม่ลงตัว
            </p>
          </div>

          <div className="side-tip">
            <strong>จัดการไฟล์ที่นำเข้าแล้ว</strong>
            <p>
              ดูประวัติไฟล์ทั้งหมด ตรวจสอบรายงานการจับคู่คอลัมน์ หรือลบไฟล์ที่นำเข้าได้ที่หมวด{" "}
              <Link href="/history" className="font-bold underline">
                ประวัติการนำเข้าไฟล์
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
