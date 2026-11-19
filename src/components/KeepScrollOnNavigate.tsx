"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "keep-scroll:import";

/**
 * จำตำแหน่งสกอลล์ก่อนกดลิงก์ในหน้า แล้วคืนให้หลังเนื้อหาใหม่โหลดเสร็จ
 * หน้า /import เปลี่ยนโหมด/เดือน/ร้านด้วยการนำทางใหม่ ระหว่างรอข้อมูลปฏิทินถูกแทนที่ด้วย skeleton
 * ทำให้หน้าสั้นลงชั่วคราวและเบราว์เซอร์ดึงสกอลล์ขึ้นข้างบน
 */
export default function KeepScrollOnNavigate({
  signature,
  children,
}: {
  signature: string;
  children: React.ReactNode;
}) {
  const pendingRef = useRef(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/import")) return;
      sessionStorage.setItem(STORAGE_KEY, String(window.scrollY));
      pendingRef.current = true;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pendingRef.current) return;
    const target = Number(sessionStorage.getItem(STORAGE_KEY) ?? "0");
    if (!Number.isFinite(target) || target <= 0) {
      pendingRef.current = false;
      return;
    }
    // เนื้อหาใหม่มาทีหลังช่วงสั้น ๆ (skeleton ก่อน) — คืนสกอลล์ซ้ำจนกว่าหน้าจะสูงพอ หรือครบ 4 วินาที
    const deadline = performance.now() + 4000;
    const tick = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) <= 2 || performance.now() > deadline) {
        pendingRef.current = false;
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
    return () => {
      pendingRef.current = false;
    };
  }, [signature]);

  return <>{children}</>;
}
