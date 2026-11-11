// ล็อกอิน Shipnity แทนผู้ใช้หนึ่งครั้ง เพื่อขอ token ของบัญชีนั้นมาใช้เชื่อมต่อ
//
// Shipnity ไม่มี OAuth: หน้าเข้าสู่ระบบเป็นฟอร์ม Devise มาตรฐาน (/users/sign_in)
// ลำดับที่ใช้: GET ฟอร์ม (เอา authenticity_token + cookie) → POST ล็อกอิน →
// ขอ CSRF ของแอป → GraphQL `me { authenticationToken }` เพื่อเอา token มาใช้กับ Open API v2
//
// รหัสผ่านถูกใช้เฉพาะในฟังก์ชันนี้และไม่ถูกเก็บ/บันทึกที่ใด

const BASE_URL = "https://www.shipnity.com";
const MAX_HTML_BYTES = 400_000;

export class ShipnityLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShipnityLoginError";
  }
}

export interface ShipnityLoginResult {
  email: string;
  token: string;
  shopName: string | null;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function readLimited(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, MAX_HTML_BYTES);
}

/** ขอ token ของบัญชี Shipnity ด้วยอีเมล/รหัสผ่าน (รหัสผ่านไม่ถูกเก็บ) */
export async function loginToShipnity(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShipnityLoginResult> {
  const jar = new CookieJar();

  const formResponse = await fetchImpl(`${BASE_URL}/users/sign_in`, {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  jar.absorb(formResponse);
  const formHtml = await readLimited(formResponse);

  const authenticityToken = /name="authenticity_token"\s+value="([^"]+)"/.exec(formHtml)?.[1];
  if (!authenticityToken) {
    throw new ShipnityLoginError("เปิดหน้าล็อกอินของ Shipnity ไม่สำเร็จ");
  }

  const body = new URLSearchParams({
    authenticity_token: authenticityToken,
    "user[email]": email,
    "user[password]": password,
    commit: "เข้าสู่ระบบ",
  });

  const loginResponse = await fetchImpl(`${BASE_URL}/users/sign_in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
      Cookie: jar.header(),
    },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(loginResponse);

  const location = loginResponse.headers.get("location") ?? "";
  const loggedIn = loginResponse.status >= 300 && loginResponse.status < 400 && !location.includes("sign_in");
  if (!loggedIn) {
    // Devise ตอบ 200 พร้อมฟอร์มเดิมเมื่อรหัสผ่านผิด
    throw new ShipnityLoginError("อีเมลหรือรหัสผ่าน Shipnity ไม่ถูกต้อง");
  }

  // token ของผู้ใช้ อ่านผ่าน GraphQL ของแอป (ต้องมี session cookie)
  const csrfResponse = await fetchImpl(`${BASE_URL}/get_csrf_token`, {
    headers: { Cookie: jar.header(), Accept: "text/plain" },
  });
  const csrfToken = (await readLimited(csrfResponse)).trim();

  const queryResponse = await fetchImpl(`${BASE_URL}/api/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: jar.header(),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: JSON.stringify({
      query:
        "{ me { email authenticationToken shop { ... on Shop { name } } } }",
    }),
  });

  const payload = (await queryResponse.json().catch(() => null)) as
    | { data?: { me?: { email?: string; authenticationToken?: string; shop?: { name?: string } | null } } }
    | null;

  const me = payload?.data?.me;
  if (!me?.authenticationToken) {
    throw new ShipnityLoginError("ล็อกอินแล้วแต่อ่าน token ของบัญชีไม่สำเร็จ");
  }

  return {
    email: me.email?.trim() || email,
    token: me.authenticationToken.trim(),
    shopName: me.shop?.name?.trim() || null,
  };
}
