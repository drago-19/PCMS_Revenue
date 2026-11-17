"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * ค่าที่ผู้ใช้เพิ่งบันทึกสำเร็จ แต่ข้อมูลจากเซิร์ฟเวอร์อาจยังไม่ตาม (เช่น TikTok ยังไม่สะท้อน)
 * - `commit(next)` ตั้งค่าใหม่ขึ้นจอทันที และกันไม่ให้ props เก่าเขียนทับ
 * - พอ props ตรงกับค่าที่รออยู่ (แปลว่า DB ตามทันแล้ว) จะเลิกใช้ค่าชั่วคราวเอง
 * ใช้กับทุกจุดที่ "บันทึกแล้วแต่หน้าจอยังไม่เปลี่ยน" เพื่อให้พฤติกรรมเหมือนกันทั้งระบบ
 */
export function usePendingValue<T>(
  fromServer: T,
  isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
): { value: T; commit: (next: T) => void; confirmed: boolean } {
  const [value, setValue] = useState<T>(fromServer);
  const [pending, setPending] = useState<T | null>(null);

  useEffect(() => {
    if (pending !== null) {
      if (isEqual(fromServer, pending)) {
        setPending(null);
        setValue(fromServer);
      }
      // ยังไม่ตรง = ข้อมูลเก่า ห้ามทับค่าที่เพิ่งบันทึก
      return;
    }
    setValue(fromServer);
  }, [fromServer, pending, isEqual]);

  const commit = useCallback((next: T) => {
    setPending(next);
    setValue(next);
  }, []);

  return { value, commit, confirmed: pending === null };
}
