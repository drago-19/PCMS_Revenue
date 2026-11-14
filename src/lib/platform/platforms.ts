// แพลตฟอร์มที่ระบบนี้รองรับ — นิยามที่เดียว เพื่อให้ทุกหน้าใช้รายการและชื่อเดียวกัน
// กฎของโปรเจกต์: TikTok / Shopee / Facebook แยกตรรกะการเงินจากกันเด็ดขาด ห้ามเหมารวมช่องทาง
// ตอนนี้มีข้อมูลจริงแค่ TikTok — ที่เหลือแสดงสถานะ "ยังไม่เชื่อมต่อ" อย่างตรงไปตรงมา

export const PLATFORM_KEYS = ["tiktok", "shopee", "facebook"] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export const DEFAULT_PLATFORM: PlatformKey = "tiktok";

export type PlatformTab = {
  key: PlatformKey;
  label: string;
  /** เชื่อมต่อและมีข้อมูลจริงแล้วหรือยัง */
  connected: boolean;
  /** สิ่งที่จะได้เมื่อเชื่อม — ใช้ในหน้าที่ยังไม่มีข้อมูล */
  gains: string[];
  /** ข้อจำกัดที่ต้องรู้ก่อน */
  caveat: string;
};

export const PLATFORM_TABS: PlatformTab[] = [
  {
    key: "tiktok",
    label: "TikTok Shop",
    connected: true,
    gains: [],
    caveat: "",
  },
  {
    key: "shopee",
    label: "Shopee",
    connected: false,
    gains: [
      "ยอดโอนต่อออเดอร์ + ค่าธรรมเนียมแยกรายการ (escrow detail)",
      "ยอดโอนที่ปล่อยจริงจาก Income API (≤14 วันต่อครั้ง)",
      "รายการปรับปรุง (adjustment) จาก wallet transaction",
      "สถานะพัสดุ + tracking และคำขอคืนเงิน",
    ],
    caveat:
      "รองรับทั้ง Sandbox (ทดสอบ) และ Live (ERP System) — เชื่อมต่อได้ที่ ตั้งค่า > เชื่อมต่อแพลตฟอร์ม",
  },
  {
    key: "facebook",
    label: "Facebook",
    connected: false,
    gains: [
      "ออเดอร์และรายการสินค้าจากไฟล์ Shipnity 2 ไฟล์",
      "ยอดขาย ค่าส่งที่ร้านจ่าย และจำนวนชิ้น ต่อออเดอร์",
      "สถานะพัสดุและการยกเลิกจากออเดอร์",
    ],
    caveat:
      "Facebook ยังไม่มีไฟล์รายได้แยกเหมือน TikTok/Shopee — ยอดชำระคำนวณจากยอดขายลบค่าส่งที่ร้านจ่าย และต้องไม่ออกใบกำกับฯ จากยอดที่ยังไม่มีไฟล์รายได้",
  },
];

export function readPlatform(value?: string | string[]): PlatformKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return (PLATFORM_KEYS as readonly string[]).includes(raw ?? "") ? (raw as PlatformKey) : DEFAULT_PLATFORM;
}

export function platformTab(key: PlatformKey): PlatformTab {
  return PLATFORM_TABS.find((tab) => tab.key === key) ?? PLATFORM_TABS[0];
}

/** ชื่อแพลตฟอร์มที่ใช้เป็นคีย์คอลัมน์ platform ในตาราง platform_* */
export function platformDbName(key: PlatformKey): string {
  switch (key) {
    case "shopee":
      return "Shopee";
    case "facebook":
      return "Facebook";
    default:
      return "TikTok";
  }
}
