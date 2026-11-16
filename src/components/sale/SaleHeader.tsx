// หัวข้อหน้าเฉพาะหมวด "แพลตฟอร์ม" — แยกจาก PageHeader ของ Dragon19 โดยตั้งใจ
// ห้ามใช้ PageHeader ร่วม: แก้ที่เดียวจะไปเปลี่ยนหน้าของ CEO/บัญชี/รายงานด้วย
// สีทั้งหมดมาจากตัวแปรของธีม platform (SALE_THEME) ไม่ผูกกับ legacy class ใน globals.css

import type { ReactNode } from "react";

export function SaleHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            <span className="inline-block size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-0.5 text-[20px] leading-7 font-bold break-words text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[80ch] text-[12.5px] leading-5 break-words text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
