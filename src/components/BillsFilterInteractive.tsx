"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { CompactValueToggle } from "@/components/CompactValueToggle";
import { IconAlert, IconCheckCircle } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatTHB } from "@/lib/format";
import { notifyNavigationStart } from "@/lib/navigation-progress";
import type {
  BillCategoryCounts,
  BillCategoryKey,
  BillLinkCounts,
  BillLinkStatusKey,
} from "@/lib/queries";

export type LinkStatusKey = BillLinkStatusKey;
type StatusKey = "all" | "ok" | "mismatch";

interface FilterState {
  category: BillCategoryKey;
  linkStatus: LinkStatusKey;
  channel: string;
  status: StatusKey;
}

interface BillsFilterContextValue {
  optimistic: FilterState;
  isPending: boolean;
  navigateWithOptimistic: (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    patch: Partial<FilterState>,
  ) => void;
}

const BillsFilterContext = createContext<BillsFilterContextValue | null>(null);

function useBillsFilterContext() {
  const ctx = useContext(BillsFilterContext);
  if (!ctx) {
    throw new Error("useBillsFilterContext must be used inside BillsFilterProvider");
  }
  return ctx;
}

export function BillsFilterProvider({
  category,
  linkStatus,
  channel,
  status,
  children,
}: FilterState & { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<FilterState>({
    category,
    linkStatus,
    channel,
    status,
  });

  useEffect(() => {
    setOptimistic({ category, linkStatus, channel, status });
  }, [category, linkStatus, channel, status]);

  function navigateWithOptimistic(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    patch: Partial<FilterState>,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setOptimistic((prev) => ({ ...prev, ...patch }));
    notifyNavigationStart();
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  }

  return (
    <BillsFilterContext.Provider
      value={{ optimistic, isPending, navigateWithOptimistic }}
    >
      <div
        data-bills-filter-shell="true"
        className="group/bills flex flex-1 flex-col"
      >
        {children}
      </div>
    </BillsFilterContext.Provider>
  );
}

function getChannelActiveStyle(channel: string) {
  if (channel === "Shopee") {
    return "border-[#ee4d2d] bg-[#ee4d2d] text-white shadow-xs";
  }
  if (channel === "Facebook") {
    return "border-[#1877F2] bg-[#1877F2] text-white shadow-xs";
  }
  return "border-primary bg-primary text-white shadow-xs";
}

function getChannelStatusButtonStyle(channel: string, active: boolean) {
  if (!active) {
    return "h-8 min-h-[32px] w-full px-2.5 text-[#334155] transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:bg-[#f1f5f9] hover:text-[#0f172a] active:scale-[0.97] sm:h-7 sm:min-h-[28px] sm:w-auto";
  }
  if (channel === "Shopee") {
    return "h-8 min-h-[32px] w-full bg-[#ee4d2d] px-2.5 text-white shadow-2xs transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:bg-[#d73211] active:scale-[0.97] sm:h-7 sm:min-h-[28px] sm:w-auto";
  }
  if (channel === "Facebook") {
    return "h-8 min-h-[32px] w-full bg-[#1877F2] px-2.5 text-white shadow-2xs transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:bg-[#166fe5] active:scale-[0.97] sm:h-7 sm:min-h-[28px] sm:w-auto";
  }
  return "h-8 min-h-[32px] w-full px-2.5 shadow-2xs transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] sm:h-7 sm:min-h-[28px] sm:w-auto";
}

export function BillsChannelBar({
  channelCounts,
  total,
  q,
  channelHrefs,
  statusHrefs,
}: {
  channelCounts: Record<string, number>;
  total: number;
  q?: string;
  channelHrefs: Record<"all" | "TikTok" | "Shopee" | "Facebook", string>;
  statusHrefs: Record<StatusKey, string>;
}) {
  const { optimistic, navigateWithOptimistic } = useBillsFilterContext();
  const activeChannel = optimistic.channel;
  const activeStatus = optimistic.status;
  const showStatusFilter =
    activeChannel !== "Shopee" && activeChannel !== "Facebook";

  const channels = [
    {
      key: "all" as const,
      label: "ทุกช่องทาง",
      subLabel: "รวมทุกแพลตฟอร์ม",
      count: channelCounts.all ?? total,
      dotColor: "bg-[#0f172a]",
      activeClass: "border-[#0f172a] bg-[#0f172a] text-white shadow-sm",
    },
    {
      key: "TikTok" as const,
      label: "TikTok Shop",
      subLabel: "ครบ 3 ไฟล์ · ยอดโอนจริง",
      count: channelCounts.TikTok ?? 0,
      dotColor: "bg-primary",
      activeClass: "border-primary bg-primary text-white shadow-sm",
    },
    {
      key: "Shopee" as const,
      label: "Shopee",
      subLabel: "ข้อมูลจากไฟล์ Shipnity",
      count: channelCounts.Shopee ?? 0,
      dotColor: "bg-[#ee4d2d]",
      activeClass: "border-[#ee4d2d] bg-[#ee4d2d] text-white shadow-sm",
    },
    {
      key: "Facebook" as const,
      label: "Facebook",
      subLabel: "ข้อมูลจากไฟล์ Shipnity",
      count: channelCounts.Facebook ?? 0,
      dotColor: "bg-[#1877F2]",
      activeClass: "border-[#1877F2] bg-[#1877F2] text-white shadow-sm",
    },
  ];

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] font-extrabold tracking-tight text-[#334155]">
          1. เลือกช่องทางจำหน่าย (Platform)
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {showStatusFilter ? (
            <div
              className="grid w-full grid-cols-3 items-center gap-0.5 rounded-xl border border-border bg-white p-1 shadow-2xs sm:inline-flex sm:w-auto sm:flex-wrap sm:gap-1"
              role="navigation"
              aria-label="กรองตามสถานะตรวจยอด"
            >
              <span className="col-span-3 px-1.5 pt-0.5 text-[11px] font-bold text-[#475569] sm:col-span-1 sm:px-1.5 sm:pt-0 sm:text-[11.5px]">
                สถานะยอด:
              </span>
              <Button
                asChild
                variant={activeStatus === "all" ? "default" : "ghost"}
                size="xs"
                className={getChannelStatusButtonStyle(
                  activeChannel,
                  activeStatus === "all",
                )}
              >
                <Link
                  href={statusHrefs.all}
                  scroll={false}
                  onClick={(e) =>
                    navigateWithOptimistic(e, statusHrefs.all, {
                      status: "all",
                    })
                  }
                >
                  ทุกสถานะยอด
                </Link>
              </Button>
              <Button
                asChild
                variant={activeStatus === "ok" ? "default" : "ghost"}
                size="xs"
                className={getChannelStatusButtonStyle(
                  activeChannel,
                  activeStatus === "ok",
                )}
              >
                <Link
                  href={statusHrefs.ok}
                  scroll={false}
                  onClick={(e) =>
                    navigateWithOptimistic(e, statusHrefs.ok, { status: "ok" })
                  }
                >
                  <IconCheckCircle size={13} /> ยอดตรง
                </Link>
              </Button>
              <Button
                asChild
                variant={activeStatus === "mismatch" ? "default" : "ghost"}
                size="xs"
                className={getChannelStatusButtonStyle(
                  activeChannel,
                  activeStatus === "mismatch",
                )}
              >
                <Link
                  href={statusHrefs.mismatch}
                  scroll={false}
                  onClick={(e) =>
                    navigateWithOptimistic(e, statusHrefs.mismatch, {
                      status: "mismatch",
                    })
                  }
                >
                  <IconAlert size={13} /> ต้องตรวจสอบ
                </Link>
              </Button>
            </div>
          ) : (
            <div
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-border bg-white px-2.5 py-1 shadow-2xs"
              role="status"
              aria-label="สถานะการตรวจยอดของช่องทาง"
            >
              <span className="text-[11px] font-bold text-[#475569] sm:text-[11.5px]">
                สถานะยอด:
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-50 px-2 text-xs font-bold text-emerald-700">
                <IconCheckCircle size={13} /> ยอดตรงตามไฟล์ Shipnity
              </span>
            </div>
          )}

          {q ? (
            <Badge variant="warning" size="sm">
              ค้นหา: &ldquo;{q}&rdquo;
            </Badge>
          ) : null}
        </div>
      </div>

      <div
        role="group"
        aria-label="กรองตามช่องทางจำหน่าย"
        className="grid max-w-[1140px] grid-cols-2 gap-2 min-[768px]:grid-cols-4"
      >
        {channels.map((ch) => {
          const active = activeChannel === ch.key;
          const href = channelHrefs[ch.key];
          return (
            <Link
              key={ch.key}
              href={href}
              scroll={false}
              onClick={(e) =>
                navigateWithOptimistic(e, href, {
                  channel: ch.key,
                  linkStatus: "all",
                  status:
                    ch.key === "Shopee" || ch.key === "Facebook"
                      ? "all"
                      : activeStatus,
                })
              }
              className={
                active
                  ? `flex min-h-[50px] items-center justify-between gap-2 rounded-xl border px-3.5 py-2 transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.985] ${ch.activeClass}`
                  : "flex min-h-[50px] items-center justify-between gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-[#0f172a] shadow-2xs transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:border-[#cbd5e1] hover:bg-[#f1f5f9] hover:shadow-xs active:translate-y-0 active:scale-[0.985]"
              }
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`size-3 shrink-0 rounded-full ${
                    active ? "bg-white ring-2 ring-white/30" : ch.dotColor
                  }`}
                />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[13px] font-extrabold">{ch.label}</span>
                  <span
                    className={`hidden text-[11px] min-[420px]:inline ${
                      active ? "text-white/85" : "text-muted-foreground"
                    }`}
                  >
                    {ch.subLabel}
                  </span>
                </div>
              </div>
              <span
                className={`mono shrink-0 rounded-lg px-2 py-0.5 text-xs font-extrabold ${
                  active
                    ? "bg-white/20 text-white"
                    : "border border-[#e2e8f0] bg-[#f8fafc] text-[#0f172a]"
                }`}
              >
                <CompactValueToggle
                  value={ch.count.toLocaleString("th-TH")}
                  stopPropagationOnClick
                />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function BillsCategoryTabs({
  categoryCounts,
  hrefs,
}: {
  categoryCounts: BillCategoryCounts;
  hrefs: Record<BillCategoryKey, string>;
}) {
  const { optimistic, navigateWithOptimistic } = useBillsFilterContext();
  const activeCategory = optimistic.category;
  const activeChannel = optimistic.channel;
  const channelActiveClass = getChannelActiveStyle(activeChannel);

  const tabs = [
    {
      key: "normal" as const,
      label: "บิลขายปกติ",
      subLabel:
        activeChannel === "Shopee" || activeChannel === "Facebook"
          ? "กำไรสุทธิ > 0 · พร้อมออกใบกำกับภาษี"
          : "มีรายได้ · ออกใบกำกับภาษี",
      count: categoryCounts.normal,
      dotColor: "bg-[#059669]",
      activeClass: channelActiveClass,
    },
    {
      key: "refund_fee" as const,
      label:
        activeChannel === "Shopee" || activeChannel === "Facebook"
          ? "คืนเงิน / ตีกลับ / ขาดทุน (ติดลบ)"
          : "คืนเงิน / ตีกลับ (ถูกหักเงิน)",
      subLabel:
        categoryCounts.refundFeePayout !== 0
          ? `ยอดติดลบสุทธิ ${formatTHB(categoryCounts.refundFeePayout)} · ไม่ยื่นภาษี`
          : "คืนเงินหลังโอน / เสียค่าส่งตีกลับ",
      count: categoryCounts.refundFee,
      dotColor: "bg-[#dc2626]",
      activeClass: channelActiveClass,
    },
    {
      key: "zero" as const,
      label: "ยกเลิก / ยอด 0 บาท",
      subLabel:
        activeChannel === "Shopee"
          ? "ตีกลับเต็มจำนวน 100% · ไม่ยื่นภาษี"
          : "ยกเลิกหรือไม่เสียค่าธรรมเนียม",
      count: categoryCounts.zero,
      dotColor: "bg-[#64748b]",
      activeClass: channelActiveClass,
    },
  ];

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <span className="text-[11.5px] font-extrabold tracking-tight text-[#334155]">
        2. เลือกประเภทบิล (Category)
      </span>
      <div
        role="tablist"
        aria-label="หมวดประเภทบิลคำสั่งซื้อ"
        className="grid max-w-[1140px] grid-cols-1 gap-1.5 rounded-xl border border-border bg-white p-1.5 shadow-2xs min-[900px]:grid-cols-3"
      >
        {tabs.map((tab) => {
          const active = activeCategory === tab.key;
          const href = hrefs[tab.key];
          return (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={active}
              scroll={false}
              href={href}
              onClick={(e) =>
                navigateWithOptimistic(e, href, {
                  category: tab.key,
                  linkStatus: "all",
                })
              }
              className={
                active
                  ? `flex min-h-[46px] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.985] ${tab.activeClass}`
                  : "flex min-h-[46px] items-center justify-between gap-2 rounded-lg border border-transparent bg-[#f8fafc] px-3 py-1.5 text-[#0f172a] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:border-[#cbd5e1] hover:bg-[#f1f5f9] hover:shadow-2xs active:translate-y-0 active:scale-[0.985]"
              }
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    active ? "bg-white" : tab.dotColor
                  }`}
                />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="text-xs font-extrabold">{tab.label}</span>
                  <span
                    className={`text-[11px] ${
                      active ? "text-white/85" : "text-muted-foreground"
                    }`}
                  >
                    {tab.subLabel}
                  </span>
                </div>
              </div>
              <span
                className={`mono shrink-0 rounded-md px-2 py-0.5 text-xs font-extrabold ${
                  active
                    ? "bg-white/20 text-white"
                    : "border border-[#e2e8f0] bg-white text-[#0f172a]"
                }`}
              >
                <CompactValueToggle
                  value={tab.count.toLocaleString("th-TH")}
                  stopPropagationOnClick
                />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function BillsSubFilters({
  linkCounts,
  linkHrefs,
}: {
  linkCounts: BillLinkCounts;
  channelCounts?: Record<string, number>;
  total?: number;
  q?: string;
  linkHrefs: Record<LinkStatusKey, string>;
  channelHrefs?: Record<"all" | "TikTok" | "Shopee" | "Facebook", string>;
  statusHrefs?: Record<StatusKey, string>;
}) {
  const { optimistic, navigateWithOptimistic } = useBillsFilterContext();
  const activeLink = optimistic.linkStatus;
  const activeChannel = optimistic.channel;
  const activeCategory = optimistic.category;

  const channelActiveClass = getChannelActiveStyle(activeChannel);

  const linkItems: Array<{
    key: LinkStatusKey;
    label: string;
    subLabel: string;
    count: number;
    dotColor: string;
    activeClass?: string;
    isActive?: (current: LinkStatusKey) => boolean;
  }> =
    activeChannel === "Facebook"
      ? activeCategory === "normal"
        ? [
            {
              key: "linked",
              label: "ข้อมูลครบ · พร้อมออกใบกำกับฯ",
              subLabel: "บิลขายปกติที่มีราคาสินค้า",
              count: linkCounts.linked,
              dotColor: "bg-[#059669]",
              activeClass: channelActiveClass,
              isActive: (cur) => cur === "all" || cur === "linked",
            },
            {
              key: "no_price",
              label: "เปลี่ยนสินค้า / ไม่มีราคาสินค้า",
              subLabel: "มีเฉพาะค่าส่ง · ไม่ยื่นภาษี",
              count: linkCounts.noPrice,
              dotColor: "bg-[#7c3aed]",
              activeClass: channelActiveClass,
            },
            {
              key: "all_fb",
              label: "รวมทั้งหมดใน Facebook",
              subLabel: "บิลขายปกติ + เปลี่ยนสินค้า",
              count: linkCounts.allWithNoPrice,
              dotColor: "bg-[#64748b]",
              activeClass: channelActiveClass,
            },
          ]
        : [
            {
              key: "all",
              label: "ทั้งหมดในหมวดนี้ (Facebook)",
              subLabel: "ผูกออเดอร์และรายการสินค้าจากไฟล์ Shipnity ครบ 100%",
              count: linkCounts.all,
              dotColor: "bg-[#1877F2]",
              activeClass: channelActiveClass,
              isActive: () => true,
            },
          ]
      : activeChannel === "Shopee"
        ? [
            {
              key: "all",
              label:
                activeCategory === "normal"
                  ? "ข้อมูลครบ · พร้อมออกใบกำกับฯ (Shopee)"
                  : "ทั้งหมดในหมวดนี้ (Shopee)",
              subLabel:
                activeCategory === "normal"
                  ? "ผูกออเดอร์และรายการสินค้าจากไฟล์ Shipnity ครบ 100%"
                  : "รายการคำสั่งซื้อ Shopee จากไฟล์ Shipnity",
              count: linkCounts.all,
              dotColor: "bg-[#ee4d2d]",
              activeClass: channelActiveClass,
              isActive: () => true,
            },
          ]
        : activeChannel === "TikTok"
          ? activeCategory === "normal"
            ? [
                {
                  key: "all",
                  label: "ทั้งหมด",
                  subLabel: "ทุกรายการใน TikTok",
                  count: linkCounts.all,
                  dotColor: "bg-[#64748b]",
                },
                {
                  key: "linked",
                  label: "ข้อมูลครบ",
                  subLabel: "พร้อมออกใบกำกับฯ",
                  count: linkCounts.linked,
                  dotColor: "bg-[#059669]",
                },
                {
                  key: "unlinked",
                  label: "รอไฟล์ออเดอร์",
                  subLabel:
                    linkCounts.missingOmsCreatedDates.length > 0
                      ? `${formatDate(linkCounts.missingOmsCreatedDates[0])}${
                          linkCounts.missingOmsCreatedDates.length > 1
                            ? ` +${linkCounts.missingOmsCreatedDates.length - 1}`
                            : ""
                        }`
                      : "มีเฉพาะยอดโอน",
                  count: linkCounts.unlinked,
                  dotColor: "bg-[#d97706]",
                },
                {
                  key: "oms_only",
                  label: "รอไฟล์รายได้",
                  subLabel: "มีเฉพาะออเดอร์",
                  count: linkCounts.omsOnly,
                  dotColor: "bg-[#2563eb]",
                },
              ]
            : [
                {
                  key: "all",
                  label: "ทั้งหมด",
                  subLabel: "ทุกรายการในหมวดนี้",
                  count: linkCounts.all,
                  dotColor: "bg-[#64748b]",
                },
                {
                  key: "linked",
                  label: "ข้อมูลครบ",
                  subLabel: "ผูกออเดอร์แล้ว",
                  count: linkCounts.linked,
                  dotColor: "bg-[#059669]",
                },
                {
                  key: "unlinked",
                  label: "รอไฟล์ออเดอร์",
                  subLabel: "มีเฉพาะยอดหัก",
                  count: linkCounts.unlinked,
                  dotColor: "bg-[#d97706]",
                },
              ]
          : activeCategory === "normal"
            ? [
                {
                  key: "all",
                  label: "ทั้งหมด",
                  subLabel: "รายการยื่นภาษี",
                  count: linkCounts.all,
                  dotColor: "bg-[#64748b]",
                },
                {
                  key: "linked",
                  label: "ข้อมูลครบ",
                  subLabel: "ออกใบกำกับฯ ได้",
                  count: linkCounts.linked,
                  dotColor: "bg-[#059669]",
                },
                {
                  key: "no_price",
                  label: "เปลี่ยนไซส์ / ฿0",
                  subLabel: "เฉพาะค่าส่ง",
                  count: linkCounts.noPrice,
                  dotColor: "bg-[#7c3aed]",
                },
                {
                  key: "unlinked",
                  label: "รอไฟล์ออเดอร์",
                  subLabel:
                    linkCounts.missingOmsCreatedDates.length > 0
                      ? `${formatDate(linkCounts.missingOmsCreatedDates[0])}${
                          linkCounts.missingOmsCreatedDates.length > 1
                            ? ` +${linkCounts.missingOmsCreatedDates.length - 1}`
                            : ""
                        }`
                      : "มีเฉพาะยอดโอน",
                  count: linkCounts.unlinked,
                  dotColor: "bg-[#d97706]",
                },
                {
                  key: "oms_only",
                  label: "รอไฟล์รายได้",
                  subLabel: "มีเฉพาะออเดอร์",
                  count: linkCounts.omsOnly,
                  dotColor: "bg-[#2563eb]",
                },
              ]
            : [
                {
                  key: "all",
                  label: "ทั้งหมด",
                  subLabel: "ทุกรายการในหมวดนี้",
                  count: linkCounts.all,
                  dotColor: "bg-[#64748b]",
                },
                {
                  key: "linked",
                  label: "ข้อมูลครบ",
                  subLabel: "ผูกออเดอร์แล้ว",
                  count: linkCounts.linked,
                  dotColor: "bg-[#059669]",
                },
                {
                  key: "unlinked",
                  label: "รอไฟล์ออเดอร์",
                  subLabel: "มีเฉพาะยอดหัก",
                  count: linkCounts.unlinked,
                  dotColor: "bg-[#d97706]",
                },
              ];

  const linkGridColsClass =
    linkItems.length === 5
      ? "grid max-w-[1140px] grid-cols-1 gap-1.5 min-[580px]:grid-cols-2 min-[980px]:grid-cols-3 min-[1280px]:grid-cols-5"
      : linkItems.length === 3
        ? "grid max-w-[1140px] grid-cols-1 gap-1.5 min-[900px]:grid-cols-3"
        : linkItems.length === 1
          ? "grid max-w-[560px] grid-cols-1 gap-1.5"
          : "grid max-w-[1140px] grid-cols-1 gap-1.5 min-[580px]:grid-cols-2 min-[1040px]:grid-cols-4";

  if (linkItems.length === 0) return null;

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <span className="text-[11.5px] font-extrabold tracking-tight text-[#334155]">
        3. สถานะความครบของข้อมูล (Data Completeness)
      </span>
      <div
        role="group"
        aria-label="กรองตามสถานะการผูกไฟล์"
        className={linkGridColsClass}
      >
        {linkItems.map((item) => {
          const active = item.isActive
            ? item.isActive(activeLink)
            : activeLink === item.key;
          const href = linkHrefs[item.key];
          const activeColorClass = item.activeClass ?? channelActiveClass;
          return (
            <Link
              key={item.key}
              href={href}
              scroll={false}
              onClick={(e) =>
                navigateWithOptimistic(e, href, { linkStatus: item.key })
              }
              className={
                active
                  ? `flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-1.5 transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.985] ${activeColorClass}`
                  : "flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-1.5 text-[#0f172a] shadow-2xs transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:border-[#cbd5e1] hover:bg-[#f1f5f9] hover:shadow-xs active:translate-y-0 active:scale-[0.985]"
              }
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    active ? "bg-white" : item.dotColor
                  }`}
                />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="text-xs font-extrabold">{item.label}</span>
                  <span
                    className={`text-[11px] ${
                      active ? "text-white/85" : "text-muted-foreground"
                    }`}
                  >
                    {item.subLabel}
                  </span>
                </div>
              </div>
              <span
                className={`mono shrink-0 rounded-lg px-2 py-0.5 text-xs font-extrabold ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-[#f1f5f9] text-[#0f172a]"
                }`}
              >
                <CompactValueToggle
                  value={item.count.toLocaleString("th-TH")}
                  stopPropagationOnClick
                />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
