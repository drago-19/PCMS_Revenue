"use client";

import {
   Suspense,
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3Icon,
  BookOpenTextIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileBarChart2Icon,
  FileTextIcon,
  FolderKanbanIcon,
  KeyRoundIcon,
  Loader2Icon,
  LogOutIcon,
  MenuIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PwaInstallControl } from "@/components/PwaInstallControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  AppMark,
  IconFile,
  IconHistory,
  IconHome,
  IconLedger,
  IconReceipt,
  IconUpload,
  IconWallet,
} from "./icons";

const items = [
  {
    href: "/",
    label: "ภาพรวมสรุปยอด",
    sub: "สรุปรายได้และยอดโอน",
    icon: IconHome,
    match: (pathname: string) => pathname === "/",
  },
  {
    href: "/bills",
    label: "บิลคำสั่งซื้อทั้งหมด",
    sub: "บิลขายและใบกำกับภาษี",
    icon: IconReceipt,
    match: (pathname: string) =>
      pathname === "/bills" ||
      pathname.startsWith("/bills/") ||
      pathname.startsWith("/invoices/") ||
      pathname === "/days" ||
      pathname.startsWith("/days/"),
  },
  {
    href: "/products",
    label: "สรุปยอดรหัสสินค้า",
    sub: "ยอดขายแยกตามสินค้า",
    icon: IconFile,
    match: (pathname: string) =>
      pathname === "/products" || pathname.startsWith("/products/"),
  },
  {
    href: "/accounting",
    label: "บริหารบัญชี",
    sub: "บัญชี รายจ่าย และภาษี",
    icon: IconLedger,
    match: (pathname: string) =>
      pathname === "/accounting" ||
      pathname.startsWith("/accounting/") ||
      pathname === "/expenses" ||
      pathname.startsWith("/expenses/"),
  },
  {
    href: "/import",
    label: "อัปโหลดไฟล์รายได้",
    sub: "นำเข้าไฟล์รายงาน",
    icon: IconUpload,
    match: (pathname: string) => pathname === "/import",
  },
  {
    href: "/history",
    label: "ประวัติการนำเข้าไฟล์",
    sub: "ตรวจสอบไฟล์ที่นำเข้า",
    icon: IconHistory,
    match: (pathname: string) =>
      pathname === "/history" || pathname.startsWith("/import/"),
  },
  {
    href: "/settings",
    label: "ตั้งค่าเอกสาร / บริษัท",
    sub: "ข้อมูลบริษัทและรูปแบบบิล",
    icon: SettingsIcon,
    match: (pathname: string) =>
      pathname === "/settings" || pathname.startsWith("/settings/"),
  },
];

function NavItemIcon({
  icon: Icon,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative inline-flex size-[18px] shrink-0 items-center justify-center">
      <Icon
        size={18}
        aria-hidden="true"
        className={cn(
          "transition-opacity duration-150 ease-out",
          pending ? "opacity-0" : "opacity-100",
        )}
      />
      <Loader2Icon
        aria-hidden="true"
        data-nav-pending={pending ? "true" : undefined}
        className={cn(
          "absolute size-[18px] transition-opacity duration-150 ease-out",
          pending ? "opacity-100" : "opacity-0",
          pending && "motion-safe:animate-spin",
        )}
      />
    </span>
  );
}

function SubNavDot({ isActive }: { isActive: boolean }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <Loader2Icon
        aria-hidden="true"
        data-nav-pending="true"
        className="size-3 shrink-0 text-[#fe2c55] motion-safe:animate-spin"
      />
    );
  }
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full transition-colors",
        isActive ? "bg-[#fe2c55]" : "bg-[#64748b]",
      )}
    />
  );
}

function AccountingSidebarSubMenu({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") || "ledger";
  const urlBook = searchParams.get("book") || "all";
  const urlReport = searchParams.get("report") || "trial_balance";
  const urlVat = searchParams.get("vat") || "pp30_summary";
  const urlExp = searchParams.get("exp") || "ledger";
  const currentPeriod = searchParams.get("period");

  const [optimisticNav, setOptimisticNav] = useState<{
    tab: string;
    book: string;
    report: string;
    vat: string;
    exp: string;
  } | null>(null);

  useEffect(() => {
    setOptimisticNav(null);
  }, [urlTab, urlBook, urlReport, urlVat, urlExp, pathname]);

  useEffect(() => {
    function handleSyncFromPage(event: Event) {
      const custom = event as CustomEvent<{
        tab?: string;
        book?: string;
        report?: string;
        vat?: string;
        exp?: string;
      }>;
      const d = custom.detail;
      if (!d) return;
      setOptimisticNav((prev) => ({
        tab: d.tab ?? prev?.tab ?? urlTab,
        book: d.book ?? prev?.book ?? urlBook,
        report: d.report ?? prev?.report ?? urlReport,
        vat: d.vat ?? prev?.vat ?? urlVat,
        exp: d.exp ?? prev?.exp ?? urlExp,
      }));
    }
    window.addEventListener("pcms:accounting-nav", handleSyncFromPage);
    return () => {
      window.removeEventListener("pcms:accounting-nav", handleSyncFromPage);
    };
  }, [urlTab, urlBook, urlReport, urlVat, urlExp]);

  const currentTab = optimisticNav?.tab ?? urlTab;
  const currentBook = optimisticNav?.book ?? urlBook;
  const currentReport = optimisticNav?.report ?? urlReport;
  const currentVat = optimisticNav?.vat ?? urlVat;
  const currentExp = optimisticNav?.exp ?? urlExp;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    journals: true,
    closing: true,
    reports: true,
    vat: true,
    expenses: true,
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const buildAccountingHref = (params: Record<string, string>) => {
    const usp = new URLSearchParams();
    if (currentPeriod && currentPeriod !== "all") {
      usp.set("period", currentPeriod);
    }
    for (const [k, v] of Object.entries(params)) {
      if (v) usp.set(k, v);
    }
    const qs = usp.toString();
    return qs ? `/accounting?${qs}` : "/accounting";
  };

  const handleSubLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    detail: {
      tab: string;
      book?: string;
      report?: string;
      vat?: string;
      exp?: string;
    },
    targetHref: string,
  ) => {
    setOptimisticNav({
      tab: detail.tab,
      book: detail.book ?? currentBook,
      report: detail.report ?? currentReport,
      vat: detail.vat ?? currentVat,
      exp: detail.exp ?? currentExp,
    });

    // หากอยู่ในหน้า /accounting อยู่แล้ว ให้สลับแท็บทันทีฝั่ง Client (< 5ms) โดยไม่ต้องยิง Server ใหม่
    if (pathname === "/accounting") {
      e.preventDefault();
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", targetHref);
        window.dispatchEvent(
          new CustomEvent("pcms:accounting-nav", { detail }),
        );
      }
      onNavigate?.();
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pcms:accounting-nav", { detail }),
      );
    }
    onNavigate?.();
  };

  const subLinkClass = (isActive: boolean) =>
    cn(
      "!flex min-h-[32px] items-center gap-2 rounded-lg !px-2.5 !py-1.5 !text-[12.5px] transition-colors",
      isActive
        ? "!bg-[#fe2c55]/20 !font-bold !text-white !shadow-none"
        : "!font-medium !text-[#cbd5e1] hover:!bg-white/[0.06] hover:!text-white",
    );

  return (
    <div
      className="mt-1 ml-2 flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-2"
      aria-label="เมนูย่อยบริหารบัญชี"
    >
      {/* 1. สมุดรายวัน */}
      <div>
        <button
          type="button"
          onClick={() => toggleGroup("journals")}
          aria-expanded={openGroups.journals}
          className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.06]"
        >
          <span className="inline-flex items-center gap-2">
            <BookOpenTextIcon className="size-3.5 text-[#38bdf8]" />
            <span>สมุดรายวัน</span>
          </span>
          {openGroups.journals ? (
            <ChevronDownIcon className="size-3.5 text-[#94a3b8]" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-[#94a3b8]" />
          )}
        </button>

        {openGroups.journals && (
          <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            {[
              { book: "JV", label: "สมุดรายวันทั่วไป" },
              { book: "UV", label: "สมุดรายวันซื้อ" },
              { book: "SV", label: "สมุดรายวันขาย" },
              { book: "PV", label: "สมุดรายวันจ่าย" },
              { book: "RV", label: "สมุดรายวันรับ" },
            ].map((item) => {
              const isActive =
                currentTab === "journals" && currentBook === item.book;
              const href = buildAccountingHref({
                tab: "journals",
                book: item.book,
              });
              return (
                <Link
                  key={item.book}
                  href={href}
                  prefetch={false}
                  scroll={false}
                  onClick={(e) =>
                    handleSubLinkClick(
                      e,
                      { tab: "journals", book: item.book },
                      href,
                    )
                  }
                  className={subLinkClass(isActive)}
                >
                  <SubNavDot isActive={isActive} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. บัญชีแยกประเภท */}
      <Link
        href={buildAccountingHref({ tab: "ledger" })}
        prefetch={false}
        scroll={false}
        onClick={(e) =>
          handleSubLinkClick(
            e,
            { tab: "ledger" },
            buildAccountingHref({ tab: "ledger" }),
          )
        }
        className={cn(
          "!flex min-h-[34px] items-center gap-2 rounded-lg !px-2 !py-1.5 !text-[12.5px] transition-colors",
          currentTab === "ledger"
            ? "!bg-[#fe2c55]/20 !font-bold !text-white !shadow-none"
            : "!font-bold !text-white hover:!bg-white/[0.06]",
        )}
      >
        <FolderKanbanIcon className="size-3.5 shrink-0 text-[#38bdf8]" />
        <span>บัญชีแยกประเภท</span>
      </Link>

      {/* 3. ปิดงบบัญชี */}
      <div>
        <button
          type="button"
          onClick={() => toggleGroup("closing")}
          aria-expanded={openGroups.closing}
          className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.06]"
        >
          <span className="inline-flex items-center gap-2">
            <BarChart3Icon className="size-3.5 text-[#38bdf8]" />
            <span>ปิดงบบัญชี</span>
          </span>
          {openGroups.closing ? (
            <ChevronDownIcon className="size-3.5 text-[#94a3b8]" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-[#94a3b8]" />
          )}
        </button>

        {openGroups.closing && (
          <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            <Link
              href={buildAccountingHref({
                tab: "reports",
                report: "closing",
              })}
              prefetch={false}
              scroll={false}
              onClick={(e) =>
                handleSubLinkClick(
                  e,
                  { tab: "reports", report: "closing" },
                  buildAccountingHref({
                    tab: "reports",
                    report: "closing",
                  }),
                )
              }
              className={subLinkClass(
                currentTab === "reports" && currentReport === "closing",
              )}
            >
              <SubNavDot
                isActive={
                  currentTab === "reports" && currentReport === "closing"
                }
              />
              <span>รายได้และค่าใช้จ่าย</span>
            </Link>
          </div>
        )}
      </div>

      {/* 4. รายงานด้านบัญชี */}
      <div>
        <button
          type="button"
          onClick={() => toggleGroup("reports")}
          aria-expanded={openGroups.reports}
          className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.06]"
        >
          <span className="inline-flex items-center gap-2">
            <FileBarChart2Icon className="size-3.5 text-[#38bdf8]" />
            <span>รายงานด้านบัญชี</span>
          </span>
          {openGroups.reports ? (
            <ChevronDownIcon className="size-3.5 text-[#94a3b8]" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-[#94a3b8]" />
          )}
        </button>

        {openGroups.reports && (
          <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            {[
              { report: "trial_balance", label: "งบทดลอง" },
              { report: "income_statement", label: "งบกำไรขาดทุน" },
              { report: "balance_sheet", label: "งบฐานะการเงิน" },
              { report: "movements", label: "รายการเคลื่อนไหว" },
            ].map((item) => {
              const isActive =
                currentTab === "reports" && currentReport === item.report;
              const href = buildAccountingHref({
                tab: "reports",
                report: item.report,
              });
              return (
                <Link
                  key={item.report}
                  href={href}
                  prefetch={false}
                  scroll={false}
                  onClick={(e) =>
                    handleSubLinkClick(
                      e,
                      { tab: "reports", report: item.report },
                      href,
                    )
                  }
                  className={subLinkClass(isActive)}
                >
                  <SubNavDot isActive={isActive} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. บริหารภาษีมูลค่าเพิ่ม */}
      <div>
        <button
          type="button"
          onClick={() => toggleGroup("vat")}
          aria-expanded={openGroups.vat}
          className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.06]"
        >
          <span className="inline-flex items-center gap-2">
            <FileTextIcon className="size-3.5 text-[#38bdf8]" />
            <span>บริหารภาษีมูลค่าเพิ่ม</span>
          </span>
          {openGroups.vat ? (
            <ChevronDownIcon className="size-3.5 text-[#94a3b8]" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-[#94a3b8]" />
          )}
        </button>

        {openGroups.vat && (
          <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            {[
              { vat: "input_docs", label: "จัดการเอกสารภาษีซื้อ" },
              { vat: "pp30_summary", label: "เตรียมแบบภาษีรายเดือน" },
              { vat: "pp36_report", label: "รายงานภาษีซื้อ ภ.พ.36" },
              { vat: "input_vat", label: "รายงานภาษีซื้อ ภ.พ.30" },
              { vat: "output_vat", label: "รายงานภาษีขาย ภ.พ.30" },
            ].map((item) => {
              const isActive =
                currentTab === "vat" && currentVat === item.vat;
              const href = buildAccountingHref({
                tab: "vat",
                vat: item.vat,
              });
              return (
                <Link
                  key={item.vat}
                  href={href}
                  prefetch={false}
                  scroll={false}
                  onClick={(e) =>
                    handleSubLinkClick(
                      e,
                      { tab: "vat", vat: item.vat },
                      href,
                    )
                  }
                  className={subLinkClass(isActive)}
                >
                  <SubNavDot isActive={isActive} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. บิลรายจ่าย & หัก ณ ที่จ่าย */}
      <div className="border-t border-white/10 pt-1">
        <button
          type="button"
          onClick={() => toggleGroup("expenses")}
          aria-expanded={openGroups.expenses}
          className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold text-white transition-colors hover:bg-white/[0.06]"
        >
          <span className="inline-flex items-center gap-2">
            <ReceiptIcon className="size-3.5 text-[#38bdf8]" />
            <span>บิลรายจ่าย & หัก ณ ที่จ่าย</span>
          </span>
          {openGroups.expenses ? (
            <ChevronDownIcon className="size-3.5 text-[#94a3b8]" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-[#94a3b8]" />
          )}
        </button>

        {openGroups.expenses && (
          <div className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            {[
              { exp: "ledger", label: "รายการบิลค่าใช้จ่าย" },
              { exp: "wht", label: "ยื่นหัก ณ ที่จ่ายออนไลน์" },
              { exp: "table", label: "สรุปกำไรสุทธิรายเดือน" },
            ].map((item) => {
              const isActive =
                currentTab === "expenses" && currentExp === item.exp;
              const href = buildAccountingHref({
                tab: "expenses",
                exp: item.exp,
              });
              return (
                <Link
                  key={item.exp}
                  href={href}
                  prefetch={false}
                  scroll={false}
                  onClick={(e) =>
                    handleSubLinkClick(
                      e,
                      { tab: "expenses", exp: item.exp },
                      href,
                    )
                  }
                  className={subLinkClass(isActive)}
                >
                  <SubNavDot isActive={isActive} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const [accountingExpanded, setAccountingExpanded] = useState(
    () =>
      pathname === "/accounting" ||
      pathname.startsWith("/accounting/") ||
      pathname === "/expenses" ||
      pathname.startsWith("/expenses/"),
  );

  useEffect(() => {
    if (
      pathname === "/accounting" ||
      pathname.startsWith("/accounting/") ||
      pathname === "/expenses" ||
      pathname.startsWith("/expenses/")
    ) {
      setAccountingExpanded(true);
    }
  }, [pathname]);

  return (
    <div className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
      <span className="px-3 text-[11px] font-bold tracking-[0.12em] uppercase text-[#64748b]">
        หมวดหมู่เมนูหลัก
      </span>
      <nav className="nav flex flex-col gap-1.5" aria-label="เมนูหลัก">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          const isAccounting = item.href === "/accounting";
          return (
            <div key={item.href} className="flex flex-col">
              <div className="relative flex items-center">
                <Link
                  href={item.href}
                  prefetch={false}
                  onClick={() => {
                    if (isAccounting) {
                      setAccountingExpanded(true);
                    }
                    onNavigate?.();
                  }}
                  className={cn(
                    "inline-flex min-h-[46px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold transition-all",
                    isAccounting && "pr-10",
                    active ? "active" : undefined,
                  )}
                  aria-label={item.label}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <NavItemIcon icon={Icon} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="!inline font-bold">{item.label}</span>
                    <span
                      className={cn(
                        "text-[11px] font-normal",
                        active ? "text-white/80" : "text-[#64748b]",
                      )}
                    >
                      {item.sub}
                    </span>
                  </span>
                </Link>
                {isAccounting && (
                  <button
                    type="button"
                    aria-label={
                      accountingExpanded
                        ? "ซ่อนหัวข้อย่อยบริหารบัญชี"
                        : "แสดงหัวข้อย่อยบริหารบัญชี"
                    }
                    aria-expanded={accountingExpanded}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAccountingExpanded((prev) => !prev);
                    }}
                    className={cn(
                      "absolute right-1.5 inline-flex size-8 items-center justify-center rounded-lg transition-colors",
                      active
                        ? "text-white hover:bg-white/20"
                        : "text-[#94a3b8] hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {accountingExpanded ? (
                      <ChevronDownIcon className="size-4" />
                    ) : (
                      <ChevronRightIcon className="size-4" />
                    )}
                  </button>
                )}
              </div>

              {isAccounting && accountingExpanded && (
                <Suspense fallback={null}>
                  <AccountingSidebarSubMenu
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                </Suspense>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function AccountControls({
  companyId = "dragon19",
  companyName,
  onAction,
}: {
  companyId?: "dragon19" | "seeheng";
  companyName?: string;
  onAction?: () => void;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const companyLabel =
    companyName?.trim() ||
    (companyId === "seeheng"
      ? "บริษัท ซีเฮง จำกัด"
      : "บริษัท ดราก้อน 19 จำกัด");

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("ออกจากระบบเรียบร้อยแล้ว");
      onAction?.();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("ออกจากระบบไม่สำเร็จ");
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPwd) return;
    if (!currentPassword || !newPassword) {
      setPwdError("กรุณากรอกรหัสผ่านให้ครบทุกช่อง");
      return;
    }
    if (newPassword.length < 6) {
      setPwdError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    setSavingPwd(true);
    setPwdError(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setPwdError(payload.error ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }
      toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
      setCurrentPassword("");
      setNewPassword("");
      setPwdOpen(false);
    } catch {
      setPwdError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="sidebar-foot mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-white">
        <ShieldCheckIcon className="size-3.5 text-[#00f2ea]" />
        <span>{companyLabel}</span>
      </div>
      <span className="mt-0.5 text-[11px] text-[#94a3b8]">
        แยกข้อมูลและเลขใบกำกับภาษีตามบริษัท
      </span>

      <div className="mt-2.5 flex flex-col gap-2">
        <PwaInstallControl variant="sidebar" />

        <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline-light"
              size="sm"
              className="w-full justify-start text-xs"
            >
              <KeyRoundIcon className="size-3.5" />
              เปลี่ยนรหัสผ่าน
            </Button>
          </DialogTrigger>
          <DialogContent className="no-print">
            <DialogHeader className="pr-11">
              <DialogTitle>เปลี่ยนรหัสผ่านผู้ดูแลระบบ</DialogTitle>
              <DialogDescription>
                รหัสผ่านใหม่จะถูกเข้ารหัสอย่างปลอดภัยและบันทึกในฐานข้อมูลทันที
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3.5">
              {pwdError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-center text-xs font-semibold text-[#b91c1c] text-balance"
                >
                  {pwdError}
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="current-password-input"
                  className="text-xs font-bold text-[#0f172a]"
                >
                  รหัสผ่านปัจจุบัน
                </label>
                <Input
                  id="current-password-input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={savingPwd}
                  placeholder="กรอกรหัสผ่านปัจจุบัน"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="new-password-input"
                  className="text-xs font-bold text-[#0f172a]"
                >
                  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
                </label>
                <Input
                  id="new-password-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingPwd}
                  placeholder="กรอกรหัสผ่านใหม่"
                  required
                />
              </div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={savingPwd}>
                    ยกเลิก
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="default"
                  loading={savingPwd}
                  disabled={savingPwd}
                >
                  บันทึกรหัสผ่านใหม่
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Button
          type="button"
          variant="outline-light"
          size="sm"
          onClick={handleLogout}
          loading={loggingOut}
          disabled={loggingOut}
          className="w-full justify-start border-[#fe2c55]/40 text-xs text-[#fecdd3] hover:bg-[#fe2c55] hover:text-white"
        >
          <LogOutIcon className="size-3.5" />
          {loggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({
  companyId = "dragon19",
  companyName,
}: {
  companyId?: "dragon19" | "seeheng";
  companyName?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [liveCompanyName, setLiveCompanyName] = useState<string | undefined>(
    companyName,
  );

  useEffect(() => {
    setLiveCompanyName(companyName);
  }, [companyName, companyId]);

  useEffect(() => {
    function handleCompanyNameChanged(event: Event) {
      const custom = event as CustomEvent<string>;
      if (typeof custom.detail === "string") {
        setLiveCompanyName(custom.detail);
      }
    }
    window.addEventListener(
      "pcms:company-name-changed",
      handleCompanyNameChanged,
    );
    return () => {
      window.removeEventListener(
        "pcms:company-name-changed",
        handleCompanyNameChanged,
      );
    };
  }, []);

  const companySubLabel =
    liveCompanyName?.trim() ||
    companyName?.trim() ||
    (companyId === "seeheng"
      ? "บริษัท ซีเฮง จำกัด"
      : "บริษัท ดราก้อน 19 จำกัด");

  if (pathname === "/login") {
    return null;
  }

  return (
    <>
      <div className="mobile-topbar no-print sticky top-0 z-40 flex h-[61px] min-[1100px]:hidden items-center gap-3 border-b border-[#1e293b] bg-[#0f1117] px-3.5 py-2.5 text-white">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline-light"
              size="icon"
              aria-label="เปิดเมนูหลัก"
              className="no-print shrink-0"
            >
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="no-print flex w-[276px] max-w-[85vw] flex-col gap-6 border-r border-[#1e293b] bg-[#0f1117] p-5 text-white"
          >
            <SheetHeader className="p-0 pr-12 text-left">
              <SheetTitle asChild>
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="brand inline-flex min-h-[40px] items-center gap-3"
                >
                  <span className="brand-mark">
                    <AppMark size={38} />
                  </span>
                  <span className="brand-text">
                    <strong>PCMS Revenue</strong>
                    <small>{companySubLabel}</small>
                  </span>
                </Link>
              </SheetTitle>
              <SheetDescription className="sr-only">
                เมนูนำทางหลักของระบบ PCMS Revenue
              </SheetDescription>
            </SheetHeader>

            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />

            <AccountControls
              companyId={companyId}
              companyName={companySubLabel}
              onAction={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <Link
          href="/"
          className="brand inline-flex min-h-[40px] min-w-0 items-center gap-2.5 px-1"
        >
          <span className="brand-mark">
            <AppMark size={36} />
          </span>
          <span className="brand-text min-w-0">
            <strong className="truncate">PCMS Revenue</strong>
            <small className="truncate">{companySubLabel}</small>
          </span>
        </Link>

        <PwaInstallControl variant="topbar" />
      </div>

      <aside className="sidebar no-print hidden min-[1100px]:flex">
        <Link href="/" className="brand min-h-[44px]">
          <span className="brand-mark">
            <AppMark size={38} />
          </span>
          <span className="brand-text">
            <strong>PCMS Revenue</strong>
            <small>{companySubLabel}</small>
          </span>
        </Link>

        <NavLinks pathname={pathname} />

        <AccountControls companyId={companyId} companyName={companySubLabel} />
      </aside>
    </>
  );
}
