"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

/** ดรอปดาวน์เลือกขนส่ง — เปลี่ยนแล้วรีเฟรชหน้าโดยคงตัวกรองอื่นไว้ */
export function CourierFilter({ couriers, value }: { couriers: string[]; value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function change(next: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (next && next !== ALL) query.set("courier", next);
    else query.delete("courier");
    query.delete("page");
    const text = query.toString();
    router.push(text ? `?${text}` : "?", { scroll: false });
  }

  return (
    <Select value={value || ALL} onValueChange={change}>
      <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="เลือกขนส่ง">
        <SelectValue placeholder="ทุกขนส่ง" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>ทุกขนส่ง</SelectItem>
        {couriers.map((courier) => (
          <SelectItem key={courier} value={courier}>
            {courier}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
