"use client";

import { useSyncExternalStore } from "react";
import {
  getNavigationPendingServerSnapshot,
  getNavigationPendingSnapshot,
  subscribeNavigationPending,
} from "@/lib/navigation-progress";

/**
 * `true` ระหว่างที่แอปกำลังรอข้อมูลหน้าใหม่ (ผู้ใช้เพิ่งกดเปลี่ยนหน้า/กดตัวกรอง)
 * ใช้แสดง skeleton เฉพาะส่วนข้อมูล โดยไม่แตะแถบตัวกรองที่เรนเดอร์ไว้แล้ว
 */
export function useNavigationPending(): boolean {
  return useSyncExternalStore(
    subscribeNavigationPending,
    getNavigationPendingSnapshot,
    getNavigationPendingServerSnapshot,
  );
}
