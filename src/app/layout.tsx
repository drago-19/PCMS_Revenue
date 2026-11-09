import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense, type ReactNode } from "react";
import { NavigationProgress } from "@/components/NavigationProgress";
import { Sidebar } from "@/components/Sidebar";
import { WindowTitleBar } from "@/components/WindowTitleBar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getActiveCompanyId } from "@/lib/db";
import { getDocumentSettings } from "@/lib/settings";
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
          <WindowTitleBar companyId={companyId} companyName={settings.name} />
          <div className="app-shell has-[[data-login-page]]:!grid-cols-1">
            <Sidebar companyId={companyId} companyName={settings.name} />
            <div className="app-main">
              <main className="app-content">{children}</main>
            </div>
          </div>
          <Toaster position="bottom-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
