// รูปสินค้าจาก CDN ของ TikTok ถูกบล็อกในบางเครือข่าย (ตัวกรองโฆษณา/ไฟร์วอลล์)
// จึงเสิร์ฟผ่านเซิร์ฟเวอร์เราแล้วแคชไว้ — อนุญาตเฉพาะโดเมนของ TikTok เท่านั้น
// (กัน SSRF: ตรวจโปรโตคอลและรายชื่อโดเมนก่อนเรียกออกไปทุกครั้ง)
const ALLOWED_HOST_SUFFIXES = [
  ".ibyteimg.com",
  ".byteimg.com",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
] as const;

export function isAllowedImageHost(hostname: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function isAllowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && isAllowedImageHost(url.hostname);
  } catch {
    return false;
  }
}

/** คืน URL ที่พร้อมใช้ใน <img> — รูปนอกที่อนุญาตจะผ่าน proxy ของเรา ที่เหลือปล่อยเดิม */
export function platformImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isAllowedImageUrl(url)) return url;
  return `/api/platform/image?u=${encodeURIComponent(url)}`;
}
