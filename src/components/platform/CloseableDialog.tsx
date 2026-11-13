"use client";

// ครอบ Dialog ให้ปุ่มกากบาท/Escape/คลิกฉากหลังปิดได้จริง
// Dialog แบบเปิดค้างไว้เฉย ๆ จะไม่รู้ว่าจะปิดยังไง — ที่นี่จึงพากลับไปหน้าที่ไม่มีพารามิเตอร์ของป๊อปอัป

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

export function CloseableDialog({ closeHref, children }: { closeHref: string; children: ReactNode }) {
  const router = useRouter();
  // ป๊อปอัปใช้ portal ฝั่งเบราว์เซอร์เท่านั้น — เรนเดอร์หลัง hydration เพื่อไม่ให้ HTML สองฝั่งไม่ตรงกัน
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;

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
