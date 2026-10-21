const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(round2(value));
}

export function formatTHB(value: number): string {
  return `฿${numberFormatter.format(round2(value))}`;
}

export function formatPlainAmount(value: number): string {
  return numberFormatter.format(round2(value));
}

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function splitIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function formatDate(iso: string): string {
  const parts = splitIsoDate(iso);
  if (!parts) return "-";
  return `${String(parts.d).padStart(2, "0")}/${String(parts.m).padStart(2, "0")}/${parts.y}`;
}

export function formatDateLong(iso: string): string {
  const parts = splitIsoDate(iso);
  if (!parts) return "-";
  return `${parts.d} ${THAI_MONTHS_SHORT[parts.m - 1]} ${parts.y}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return formatted.replace(",", "");
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BAHT_DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const BAHT_PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function bahtTextForInteger(value: number): string {
  const numberText = String(value);
  const length = numberText.length;
  let result = "";
  for (let index = 0; index < length; index++) {
    const digit = Number(numberText[index]);
    const position = length - index - 1;
    if (digit === 0) continue;
    if (position % 6 === 0 && index !== length - 1) {
      result += BAHT_DIGITS[digit] + BAHT_PLACES[0];
      result += BAHT_PLACES[6];
      continue;
    }
    const place = position % 6;
    if (place === 1 && digit === 1) {
      result += "สิบ";
      continue;
    }
    if (place === 1 && digit === 2) {
      result += "ยี่สิบ";
      continue;
    }
    if (place === 0 && digit === 1 && length > 1) {
      result += "เอ็ด";
      continue;
    }
    result += BAHT_DIGITS[digit];
    result += BAHT_PLACES[place];
  }
  return result;
}

export function bahtText(amount: number): string {
  const rounded = round2(amount);
  const whole = Math.floor(Math.abs(rounded));
  const satang = Math.round((Math.abs(rounded) - whole) * 100);
  const bahtPart = whole === 0 ? "ศูนย์บาท" : `${bahtTextForInteger(whole)}บาท`;
  const satangPart =
    satang === 0 ? "ถ้วน" : `${bahtTextForInteger(satang)}สตางค์`;
  const sign = rounded < 0 ? "ลบ" : "";
  return `${sign}${bahtPart}${satangPart}`;
}
