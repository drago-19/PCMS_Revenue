"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * ห่อส่วนตัวเลือกของหน้าพิมพ์ใบกำกับรวม (ตัวกรอง/ช่องทาง/ชุด) ให้ย่อ-ขยายได้
 * เพื่อไม่ให้แถบที่ติดบนจอ (sticky) บังใบกำกับตอนเลื่อนดู
 */
export function PrintToolbarCollapse({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <div className="flex justify-end border-t border-border/70 px-3.5 py-2 sm:px-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 gap-1.5"
          aria-expanded={open}
          aria-controls="print-toolbar-body"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "ย่อตัวเลือก" : "ขยายตัวเลือก"}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>
      <div id="print-toolbar-body" hidden={!open}>
        {children}
      </div>
    </>
  );
}
