"use client";

import { useState } from "react";
import { IconChevronDown, IconFilter } from "@/components/icons";
import { cn } from "@/lib/utils";

interface BillsMobileFilterCollapseProps {
  children: React.ReactNode;
  category: string;
  linkStatus: string;
  categoryLabel?: string;
  linkLabel?: string;
}

export function BillsMobileFilterCollapse({
  children,
  category,
  linkStatus,
  categoryLabel = "บิลขายปกติ",
  linkLabel = "ทั้งหมด",
}: BillsMobileFilterCollapseProps) {
  const isFiltered = category !== "normal" || linkStatus !== "all";
  // ถ้ามีการเลือกตัวกรองที่ไม่ใช่ค่าปกติ ให้กางอัตโนมัติเพื่อให้ผู้ใช้เห็นสิ่งที่เลือก
  const [isOpen, setIsOpen] = useState(isFiltered);

  return (
    <div className="flex flex-col">
      {/* ปุ่มกดพับ/กางตัวกรองเฉพาะจอมือถือ (< 768px) */}
      <div className="mb-2.5 min-[768px]:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all duration-200 active:scale-[0.985]",
            isFiltered
              ? "border-primary/40 bg-primary/[0.08] text-primary shadow-xs"
              : "border-border bg-white text-[#334155] shadow-2xs hover:bg-[#f8fafc]"
          )}
          aria-expanded={isOpen}
          aria-label="สลับการแสดงตัวกรองหมวดบิลและความครบของข้อมูล"
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <IconFilter size={14} className={cn("shrink-0", isFiltered ? "text-primary" : "text-[#64748b]")} />
            <span className="text-[11px] text-[#64748b]">ตัวกรองละเอียด:</span>
            <span className={cn("truncate font-extrabold", isFiltered ? "text-primary" : "text-[#0f172a]")}>
              {categoryLabel} {linkLabel !== "ทั้งหมด" ? `· ${linkLabel}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#64748b]">
            <span>{isOpen ? "ซ่อน" : "เลือกหมวด/ไฟล์"}</span>
            <IconChevronDown
              size={14}
              className={cn("transition-transform duration-200", isOpen && "rotate-180")}
            />
          </span>
        </button>
      </div>

      {/* กล่องบรรจุตัวกรอง: บนเดสก์ท็อปแสดงเสมอ (min-[768px]:!block) / บนมือถือแสดงตามสถานะ isOpen */}
      <div
        className={cn(
          "min-[768px]:!block",
          isOpen ? "block animate-in fade-in-50 duration-200" : "hidden"
        )}
      >
        {children}
      </div>
    </div>
  );
}
