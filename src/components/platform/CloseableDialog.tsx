"use client";

// ครอบ Dialog ให้ปุ่มกากบาท/Escape/คลิกฉากหลังปิดได้จริง
// Dialog แบบเปิดค้างไว้เฉย ๆ จะไม่รู้ว่าจะปิดยังไง — ที่นี่จึงพากลับไปหน้าที่ไม่มีพารามิเตอร์ของป๊อปอัป

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

export function CloseableDialog({ closeHref, children }: { closeHref: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref);
      }}
    >
      {children}
    </Dialog>
  );
}
