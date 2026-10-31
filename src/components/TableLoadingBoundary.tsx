"use client";

import type { ReactNode } from "react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useNavigationPending } from "@/lib/use-navigation-pending";

/**
 * ครอบ "เฉพาะส่วนข้อมูล/ตาราง" ของหน้า list
 * - ระหว่างรอ server (กดตัวกรอง/แบ่งหน้า/เรียงลำดับ/เลือกวันที่) → แสดง skeleton ตาราง
 * - แถบตัวกรองซึ่งอยู่นอก boundary ยังอยู่ครบ กดซ้ำ/เปลี่ยนตัวกรองต่อได้ทันที
 */
export function TableLoadingBoundary({
  children,
  rows = 8,
  columns = 5,
  label,
}: {
  children: ReactNode;
  rows?: number;
  columns?: number;
  label?: string;
}) {
  const pending = useNavigationPending();

  if (!pending) return <>{children}</>;

  return <TableSkeleton rows={rows} columns={columns} label={label} />;
}
