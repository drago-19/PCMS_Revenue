// "มิติแพลตฟอร์ม" ของหมวดนี้ — TikTok / Shopee / Facebook
// ตัวสลับแพลตฟอร์ม + หน้าสถานะเมื่อยังไม่เชื่อม + ตัวกันเนื้อหา
// เปลือกหน้าจอ (เมนู แถบช่วงเวลา การ์ดตัวเลข) ใช้ร่วมกันทุกแพลตฟอร์ม
// ส่วนที่ผูกกับ TikTok คือ "ข้อมูล" ไม่ใช่ "หน้าตา" — วันที่เชื่อม Shopee/Facebook ก็เสียบเข้าที่เดิมได้

import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/PageHeader";
import { IconInfo, IconReceipt } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PLATFORM_TABS, platformTab, type PlatformKey } from "@/lib/platform/platforms";

/** ตัวสลับแพลตฟอร์ม — เก็บช่วงเวลาไว้ (ไม่พก shop ID ข้ามแพลตฟอร์ม) */
export function PlatformSwitcher({
  platform,
  basePath,
  from,
  to,
  shop,
  connectedPlatforms,
}: {
  platform: PlatformKey;
  basePath: string;
  from?: string;
  to?: string;
  shop?: string;
  connectedPlatforms?: PlatformKey[];
}) {
  return (
    <nav aria-label="เลือกแพลตฟอร์ม" className="flex min-w-0 flex-wrap items-center gap-1.5">
      {PLATFORM_TABS.map((tab) => {
        const active = tab.key === platform;
        const isConnected = connectedPlatforms ? connectedPlatforms.includes(tab.key) : tab.connected;
        const qs = new URLSearchParams();
        if (tab.key !== "tiktok") qs.set("platform", tab.key);
        if (from) qs.set("from", from);
        if (to) qs.set("to", to);
        if (active && shop) qs.set("shop", shop);
        const href = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;

        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-foreground bg-foreground text-background"
                : isConnected
                  ? "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {!isConnected ? <span className="sr-only">(ยังไม่เชื่อมต่อ)</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** สถานะเมื่อแพลตฟอร์มยังไม่เชื่อม — บอกให้ครบว่าจะได้อะไร และติดอะไรอยู่ */
export function PlatformNotConnected({ platform }: { platform: PlatformKey }) {
  const tab = platformTab(platform);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <EmptyState
        icon={<IconReceipt size={22} aria-hidden="true" />}
        title={`${tab.label} ยังไม่เชื่อมต่อ`}
        description="ระบบแยกข้อมูลของแต่ละแพลตฟอร์มจากกัน — จะแสดงตัวเลขก็ต่อเมื่อเชื่อมและมีข้อมูลจริงแล้วเท่านั้น"
      />

      <Card variant="info" padding="padded" className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-[14.5px] font-bold">
          <IconInfo size={15} aria-hidden="true" className="text-[#1d4ed8]" />
          สิ่งที่จะได้เมื่อเชื่อม {tab.label}
        </h2>
        <ul className="ml-4 list-disc text-[13px] leading-6 text-muted-foreground">
          {tab.gains.map((gain) => (
            <li key={gain}>{gain}</li>
          ))}
        </ul>
        <p className="text-[12px] leading-5 text-muted-foreground">เงื่อนไข: {tab.caveat}</p>
        {platform !== "facebook" ? (
          <div className="pt-1">
            <Button asChild size="sm" variant="outline">
              <Link href="/settings?tab=platforms">ไปตั้งค่าเชื่อมต่อ {tab.label}</Link>
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/** ตัวกันเนื้อหา — แสดงเนื้อหาจริงเฉพาะแพลตฟอร์มที่เชื่อมแล้ว */
export function PlatformBody({
  platform,
  connected,
  children,
}: {
  platform: PlatformKey;
  connected?: boolean;
  children: ReactNode;
}) {
  const allowed = connected ?? platform === "tiktok";
  if (allowed) return <>{children}</>;
  return <PlatformNotConnected platform={platform} />;
}
