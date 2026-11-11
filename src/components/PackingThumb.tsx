"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface PackingThumbProps {
  src: string;
  name: string;
  /** sm = รูปย่อสำหรับตารางที่ต้องการให้แถวเตี้ย */
  size?: "md" | "sm";
}

/** รูปสินค้าในตารางแพ็ค — กดเพื่อเปิดดูรูปเต็ม */
export function PackingThumb({ src, name, size = "md" }: PackingThumbProps) {
  const [open, setOpen] = useState(false);
  const sizeClass = size === "sm" ? "size-10" : "size-14 min-[768px]:size-16";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`เปิดดูรูป ${name}`}
          title="กดเพื่อดูรูปใหญ่"
          className={`group relative inline-flex ${sizeClass} shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-white transition-shadow hover:border-primary/60 hover:shadow-[0_2px_10px_rgba(15,23,42,0.12)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none`}
        >
          <img
            src={src}
            alt={name}
            width={64}
            height={64}
            loading="lazy"
            data-packing-thumb=""
            className="size-full object-cover"
          />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-[min(92vw,760px)]">
        <DialogHeader className="pr-11">
          <DialogTitle className="text-base">{name}</DialogTitle>
          <DialogDescription>รูปสินค้าจาก Shipnity</DialogDescription>
        </DialogHeader>
        <img
          src={src}
          alt={name}
          className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-xl border border-border object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
