"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * แถวตารางที่กดได้ทั้งแถว (ไม่ต้องเล็งที่รหัส SKU) และกดด้วยคีย์บอร์ดได้
 * ใช้ <tr> จริงเพื่อให้ตารางยังถูกต้อง semantically — ใส่ Link ครอบ <tr> ไม่ได้
 */
export function ClickableRow({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      tabIndex={0}
      role="link"
      aria-label={label}
      onClick={() => router.push(href)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      className={cn(
        "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      {children}
    </tr>
  );
}
