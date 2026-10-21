import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="not-found">
      <p className="eyebrow">ไม่พบข้อมูล</p>
      <h1>ไม่พบบิลหรือหน้านี้</h1>
      <p>ข้อมูลอาจถูกลบไปแล้ว หรือหมายเลขคำสั่งซื้อไม่ถูกต้อง</p>
      <div className="page-actions">
        <Button asChild variant="default">
          <Link href="/">กลับภาพรวม</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/bills">
            <IconArrowLeft size={16} /> ดูบิลทั้งหมด
          </Link>
        </Button>
      </div>
    </Card>
  );
}
