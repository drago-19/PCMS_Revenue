"use client";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SALE_THEME } from "@/lib/sale/theme";
import { cn } from "@/lib/utils";

/**
 * รูปสินค้าที่กดดูขนาดใหญ่ได้ในหน้าเดิม (ป๊อปอัพ)
 * เดิมเป็นลิงก์ target="_blank" ไปยัง CDN ของ TikTok ทำให้กดแล้วเด้งออกจากหน้าจอที่กำลังทำงาน
 */
export function ImagePreview({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="ดูรูปสินค้าขนาดใหญ่"
          className={cn(
            "block size-20 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border border-border bg-muted",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
            className,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="size-full object-cover" />
        </button>
      </DialogTrigger>
      {/* ป๊อปอัพอยู่ใน portal นอกตัวครอบธีม จึงส่งชุดสีเข้าไปเอง */}
      <DialogContent className="sm:max-w-2xl" style={SALE_THEME}>
        <DialogTitle className="pr-11 text-[14px] leading-5">{alt}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-[75dvh] w-full rounded-lg bg-[color:var(--secondary)] object-contain" />
      </DialogContent>
    </Dialog>
  );
}
