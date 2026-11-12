// ที่อยู่จริงของแอปสำหรับสร้างลิงก์เด้งกลับ (redirect)
//
// ในคอนเทนเนอร์ Next ฟังอยู่ที่ 0.0.0.0:3000 ทำให้ `new URL(request.url)` ได้ host
// เป็นที่อยู่ภายใน ซึ่งเบราว์เซอร์ของผู้ใช้เปิดไม่ได้ — ต้องใช้โดเมนที่ผู้ใช้เรียกเข้ามา
// (ผ่าน x-forwarded-host/proto ของ proxy) หรือ APP_BASE_URL ถ้าตั้งไว้

export function getAppBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const internal = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? internal.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : internal.protocol.replace(":", ""));

  return `${proto}://${host}`;
}

/** สร้าง URL เต็มของเส้นทางภายในแอป เช่น /platform?tiktok=connected */
export function appUrl(request: Request, path: string): URL {
  return new URL(path, getAppBaseUrl(request));
}
