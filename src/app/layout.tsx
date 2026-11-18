import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { NavigationProgress } from "@/components/NavigationProgress";
import { Sidebar } from "@/components/Sidebar";
import { WindowTitleBar } from "@/components/WindowTitleBar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SaleChrome } from "@/components/sale/SaleChrome";
import { SaleTabs } from "@/components/sale/SaleTabs";
import { getActiveCompanyId } from "@/lib/db";
import { getDocumentSettings } from "@/lib/settings";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session-token";
import "./globals.css";

const notoSansThai = localFont({
  src: [
    { path: "../fonts/NotoSansThai-Thai.woff2", weight: "400 700", style: "normal" },
    { path: "../fonts/NotoSansThai-Latin.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-thai",
  display: "swap",
});

const inter = localFont({
  src: "../fonts/Inter-Latin.woff2",
  weight: "400 700",
  variable: "--font-latin",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono-Latin.woff2",
  weight: "500 700",
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(max-width: 1099px)", color: "#0f1117" },
    { media: "(min-width: 1100px)", color: "#f1f4f9" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const companyId = await getActiveCompanyId();
  const settings = await getDocumentSettings();
  // role ใช้ตัดสินว่าเมนูด้านซ้ายจะแสดงหมวดไหน (บัญชี "platform" เห็นเฉพาะหมวดแพลตฟอร์ม)
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  const role = session?.role ?? "admin";
  // ชื่อบัญชีที่ล็อกอินอยู่ — ใช้ตัดสินว่าบัญชีนี้ควรเห็นปุ่มอะไรในเมนูบัญชี
  const username = session?.sub ?? null;
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <TooltipProvider delayDuration={150}>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {/* บัญชีฝ่ายขาย (platform) ใช้เปลือกสว่างของหมวด /sale — ไม่แตะเปลือกของ Dragon19 */}
          {role === "platform" ? (
            <>
              <SaleChrome />
              {/* เมนูหมวดฝ่ายขายเป็นแถวของตัวเองใต้แถบหัว — ไม่ยัดในแถบหัวอีก */}
              <Suspense fallback={null}>
                <SaleTabs />
              </Suspense>
            </>
          ) : (
            <WindowTitleBar companyId={companyId} companyName={settings.name} />
          )}
          <div className={`app-shell has-[[data-login-page]]:!grid-cols-1 ${role === "platform" ? "!grid-cols-1" : ""}`}>
            {role === "platform" ? null : (
              <Sidebar companyId={companyId} companyName={settings.name} role={role} username={username} />
            )}
            <div className="app-main">
              <main className="app-content">{children}</main>
            </div>
          </div>
          {/* แจ้งเตือนของฝ่ายขายอยู่มุมขวาบน (ตามที่ตกลง) — ฝั่ง Dragon19 คงมุมขวาล่างไว้เหมือนเดิม */}
          <Toaster position={role === "platform" ? "top-right" : "bottom-right"} richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
