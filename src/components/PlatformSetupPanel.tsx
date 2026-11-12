"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { IconInfo, IconReceipt, IconTruck } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface PlatformStatusView {
  configured: boolean;
  shopNames: string[];
}

const ORDER_STATUS_FILTERS = [
  "ทั้งหมด",
  "กำลังส่ง",
  "ส่งถึงแล้ว",
  "ยกเลิก",
  "ขอคืนเงิน",
  "ลูกค้าปฏิเสธรับ",
] as const;

const PLANNED_STEPS = [
  {
    title: "1. เชื่อมต่อร้าน",
    detail: "ใส่ key/token ของแต่ละแพลตฟอร์มที่หน้าตั้งค่า แล้วตรวจว่าดึงร้านได้จริง",
  },
  {
    title: "2. ดึงออเดอร์และยอดเงิน",
    detail: "ดึงออเดอร์ รายการสินค้า ยอดโอน และค่าธรรมเนียมรายออเดอร์ พร้อมกันซ้ำได้โดยไม่เกิดข้อมูลซ้ำ",
  },
  {
    title: "3. สถานะขนส่งและปัญหา",
    detail: "ติดตามสถานะขนส่ง ยกเลิก คืนเงิน และลูกค้าปฏิเสธรับ พร้อมไทม์ไลน์ต่อออเดอร์",
  },
  {
    title: "4. เทียบยอดก่อนใช้จริง",
    detail: "เทียบยอดกับไฟล์ที่อัปโหลดอยู่ทุกวัน ต้องตรงตามเกณฑ์ก่อนเชื่อตัวเลข",
  },
] as const;

type PlatformTab = "overview" | "orders" | "runs";

export function PlatformSetupPanel({ status }: { status: PlatformStatusView }) {
  const [activeTab, setActiveTab] = useState<PlatformTab>("overview");
  const connected = status.shopNames.length > 0;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as PlatformTab)}
      className="min-w-0"
    >
      <TabsList
        aria-label="เลือกมุมมองการดึงข้อมูลจากแพลตฟอร์ม"
        className="w-full min-[480px]:w-fit"
      >
        <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
        <TabsTrigger value="orders">ออเดอร์</TabsTrigger>
        <TabsTrigger value="runs">ประวัติ</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
        <Card padding="padded" className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
              >
                <IconReceipt size={16} />
              </span>
              <span className="min-w-0 truncate text-[15px] font-bold">
                การเชื่อมต่อแพลตฟอร์ม
              </span>
            </div>
            {connected ? (
              <Badge variant="success">เชื่อมแล้ว {status.shopNames.length} ร้าน</Badge>
            ) : status.configured ? (
              <Badge variant="warning">ยังไม่เชื่อมร้าน</Badge>
            ) : (
              <Badge variant="neutral">ยังไม่ตั้งค่า</Badge>
            )}
          </div>

          {connected ? (
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {status.shopNames.map((name) => (
                <li key={name}>
                  <Badge variant="outline">{name}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-6 text-muted-foreground">
              ยังไม่มีร้านที่เชื่อม — ใส่ App Key / App Secret / Service ID และกดเชื่อมร้านได้ที่หน้าตั้งค่า
            </p>
          )}

          <div>
            {connected ? (
              <Button variant="outline" asChild>
                <Link href="/settings?tab=platforms">จัดการการเชื่อมต่อ</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/settings?tab=platforms">ไปที่หน้าตั้งค่า · เชื่อมต่อแพลตฟอร์ม</Link>
              </Button>
            )}
          </div>
        </Card>

        <Card variant="info" padding="padded" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <IconInfo size={16} aria-hidden="true" className="shrink-0 text-[#1d4ed8]" />
            <h2 className="text-[15px] font-bold">หน้านี้จะทำอะไรได้ เมื่อพัฒนาเสร็จ</h2>
          </div>
          <ol className="flex flex-col gap-3">
            {PLANNED_STEPS.map((step) => (
              <li key={step.title} className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14px] font-bold">{step.title}</span>
                <span className="text-[13px] leading-6 text-muted-foreground">
                  {step.detail}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </TabsContent>

      <TabsContent value="orders" className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold text-muted-foreground">ตัวกรองสถานะที่จะมี</p>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {ORDER_STATUS_FILTERS.map((label) => (
              <li key={label}>
                <Badge variant="outline">{label}</Badge>
              </li>
            ))}
          </ul>
        </div>

        <EmptyState
          icon={<IconTruck size={22} aria-hidden="true" />}
          title="ยังไม่มีข้อมูลออเดอร์"
          description="เมื่อเชื่อมต่อร้านและกดดึงข้อมูล ออเดอร์จะแสดงที่นี่พร้อมสถานะขนส่ง ยอดโอนสุทธิ และสถานะการคืนเงินของแต่ละรายการ"
        />
      </TabsContent>

      <TabsContent value="runs" className="mt-4 flex flex-col gap-4">
        <EmptyState
          icon={<IconReceipt size={22} aria-hidden="true" />}
          title="ยังไม่มีประวัติการดึงข้อมูล"
          description="ทุกครั้งที่กดดึงข้อมูล ระบบจะบันทึกช่วงวันที่ จำนวนรายการที่ได้ และข้อผิดพลาดไว้ที่นี่ เพื่อให้เห็นได้ว่าข้อมูลวันไหนยังไม่ครบ"
        />
      </TabsContent>
    </Tabs>
  );
}
