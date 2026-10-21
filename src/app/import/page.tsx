import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { UploadForm } from "@/components/UploadForm";
import { IconCheckCircle, IconFile, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDateTime, formatFileSize } from "@/lib/format";
import { listImports } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "อัปโหลดรายได้" };

export default async function ImportPage() {
  const imports = await listImports(50);

  return (
    <>
      <PageHeader
        eyebrow="TikTok Shop · นำเข้าข้อมูล"
        title="อัปโหลดไฟล์รายได้"
        description="นำเข้าไฟล์ Excel จาก TikTok Shop Seller Center แล้วระบบจะสร้างบิลรายคำสั่งซื้อให้ทันที พร้อมรายงานการจับคู่คอลัมน์และการตรวจยอด"
        actions={
          <Button asChild variant="secondary">
            <Link href="/bills">
              <IconReceipt size={17} /> ดูบิลทั้งหมด
            </Link>
          </Button>
        }
      />

      <div className="import-grid">
        <Card padding="padded" className="card-pad">
          <h2 className="card-title">นำเข้าไฟล์ .xlsx</h2>
          <p className="card-sub">
            ไฟล์จาก Seller Center → รายได้ → รายละเอียดคำสั่งซื้อ (หรือไฟล์ที่มีชีต
            “รายละเอียดคำสั่งซื้อ”)
          </p>
          <UploadForm />
        </Card>

        <Card padding="padded" className="card-pad side-notes">
          <div>
            <h3>ระบบตรวจให้ทุกครั้ง</h3>
            <ul className="check-list">
              <li>
                <IconCheckCircle size={17} /> จับคู่หัวคอลัมน์ไทย/อังกฤษ และรายงานคอลัมน์ใหม่
              </li>
              <li>
                <IconCheckCircle size={17} /> เทียบยอดรายได้ ค่าธรรมเนียม และยอดชำระกับชีตสรุป
              </li>
              <li>
                <IconCheckCircle size={17} /> รวมหลายแถวของคำสั่งซื้อเดียวกันเป็นบิลเดียว
              </li>
              <li>
                <IconCheckCircle size={17} /> กันไฟล์ซ้ำด้วย hash ของไฟล์
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
            <strong>ทำบิลทุกวัน</strong>
            <p>
              อัปโหลดไฟล์ของวันนั้นผ่านหน้านี้ หรือใช้คำสั่ง{" "}
              <code>pnpm import:dir -- &lt;folder&gt;</code> เพื่อนำเข้าทุกไฟล์ในโฟลเดอร์
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติการนำเข้า</CardTitle>
          <span className="muted small">{imports.length} ไฟล์ล่าสุด</span>
        </CardHeader>
        {imports.length === 0 ? (
          <div className="inline-empty">
            <IconFile size={22} />
            <span>ยังไม่มีการนำเข้า — ไฟล์แรกจะแสดงที่นี่พร้อมรายงานการตรวจยอด</span>
          </div>
        ) : (
          <Table variant="stack">
            <TableHeader>
              <TableRow>
                <TableHead>ไฟล์</TableHead>
                <TableHead>นำเข้าเมื่อ</TableHead>
                <TableHead>รอบชำระ</TableHead>
                <TableHead className="num">บิล</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="num">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((item) => (
                <TableRow key={item.id}>
                  <TableCell data-label="ไฟล์">
                    <Link
                      href={`/import/${item.id}`}
                      className="file-link inline-flex min-h-[40px] items-center"
                    >
                      <IconFile size={16} />
                      <span className="break-all whitespace-normal">{item.filename}</span>
                    </Link>
                    <span className="file-meta">
                      {formatFileSize(item.fileSize)} · {item.source === "cli" ? "CLI" : "อัปโหลด"}
                    </span>
                  </TableCell>
                  <TableCell data-label="นำเข้าเมื่อ">{formatDateTime(item.importedAt)}</TableCell>
                  <TableCell data-label="รอบชำระ">
                    {item.periodStart
                      ? item.periodStart === item.periodEnd
                        ? formatDate(item.periodStart)
                        : `${formatDate(item.periodStart)} – ${formatDate(item.periodEnd ?? item.periodStart)}`
                      : "-"}
                  </TableCell>
                  <TableCell data-label="บิล" className="num">
                    {item.orderCount.toLocaleString("th-TH")}
                  </TableCell>
                  <TableCell data-label="สถานะ">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell data-label="จัดการ" className="num">
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      {item.periodStart ? (
                        <Button asChild variant="ghost" size="xs">
                          <Link href={`/days/${item.periodStart}`}>ดูรอบชำระ</Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="secondary" size="xs">
                        <Link href={`/import/${item.id}`}>รายงาน</Link>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
