import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getActiveCompanyId } from "@/lib/db";
import { getDocumentSettings } from "@/lib/settings";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PCMS Revenue | สรุปบิลรายได้ TikTok Shop",
    template: "%s | PCMS Revenue",
  },
  description:
    "นำเข้าไฟล์รายได้ TikTok Shop และสร้างบิลสรุปยอดชำระแยกตามหมายเลขคำสั่งซื้อ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const companyId = await getActiveCompanyId();
  const settings = await getDocumentSettings();
  return (
    <html lang="th">
      <body>
        <TooltipProvider delayDuration={150}>
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
