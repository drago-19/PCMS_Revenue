"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SALE_THEME } from "@/lib/sale/theme";

const COMPANIES = [
  { key: "dragon19", label: "ดราก้อน 19" },
  { key: "seeheng", label: "ชีเฮง" },
] as const;

type CompanyKey = (typeof COMPANIES)[number]["key"];

/**
 * การ์ดบัญชี Shipnity ในหน้าตั้งค่าฝ่ายขาย
 * - แสดงบัญชีที่กรอกไว้แล้ว (ชื่อ/อีเมล) พร้อมบริษัทที่สังกัด
 * - เลือกบริษัทได้ทันที; รอบดึงออเดอร์จะใช้เฉพาะบัญชีของบริษัทที่กำลังทำงาน
 */
export function ShipnityAccountsCard({
  accounts,
}: {
  accounts: Array<{ id: string; label: string; email: string; companyKey: CompanyKey }>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(accounts);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", email: "", token: "", company: "dragon19" as CompanyKey });

  const addAccount = async () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/shipnity/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "เพิ่มบัญชีไม่สำเร็จ");
        return;
      }
      setForm({ label: "", email: "", token: "", company: "dragon19" });
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่");
    } finally {
      setAdding(false);
    }
  };

  const change = async (accountId: string, company: CompanyKey) => {
    if (saving) return;
    setSaving(accountId);
    setError(null);
    const snapshot = current;
    setCurrent((rows) => rows.map((row) => (row.id === accountId ? { ...row, companyKey: company } : row)));
    try {
      const res = await fetch("/api/platform/shipnity/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, company }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCurrent(snapshot);
        setError(data.error ?? "บันทึกบริษัทของบัญชีไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch {
      setCurrent(snapshot);
      setError("เชื่อมต่อไม่สำเร็จ — ลองใหม่");
    } finally {
      setSaving(null);
    }
  };



  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-baseline items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold">บัญชี Shipnity</h2>
        <span className="text-[11.5px] text-muted-foreground">รอบดึงออเดอร์ใช้เฉพาะบัญชีของบริษัทที่กำลังทำงาน</span>
      </div>

      <div className="flex flex-col gap-2">
        {current.map((account) => (
          <div key={account.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{account.label}</span>
            <span className="hidden min-w-0 truncate text-[11.5px] text-muted-foreground min-[560px]:inline">
              {account.email}
            </span>
            <Select
              value={account.companyKey}
              onValueChange={(next) => void change(account.id, next as CompanyKey)}
              disabled={saving === account.id}
            >
              <SelectTrigger aria-label={`บริษัทของบัญชี ${account.label}`} className="min-h-[36px] w-[132px] text-[12.5px] font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={SALE_THEME}>
                {COMPANIES.map((item) => (
                  <SelectItem key={item.key} value={item.key} className="text-[12.5px]">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid gap-2 border-t border-border pt-2 min-[640px]:grid-cols-[1fr_1fr_1fr_132px_auto] min-[640px]:items-end">
        <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
          ชื่อบัญชี
          <input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="เช่น kissi-main"
            className="min-h-[36px] rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
          อีเมล
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="kissistudio@gmail.com"
            className="min-h-[36px] rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
          Token
          <input
            type="password"
            value={form.token}
            onChange={(event) => setForm({ ...form, token: event.target.value })}
            placeholder="วาง token ของ Shipnity"
            className="min-h-[36px] rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-muted-foreground">
          บริษัท
          <Select value={form.company} onValueChange={(next) => setForm({ ...form, company: next as CompanyKey })}>
            <SelectTrigger className="min-h-[36px] text-[12.5px] font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={SALE_THEME}>
              {COMPANIES.map((item) => (
                <SelectItem key={item.key} value={item.key} className="text-[12.5px]">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <button
          type="button"
          onClick={() => void addAccount()}
          disabled={adding}
          className="min-h-[36px] rounded-md bg-[color:var(--primary)] px-3 text-[12.5px] font-bold text-[color:var(--primary-foreground)] disabled:opacity-60"
        >
          {adding ? "กำลังเพิ่ม…" : "เพิ่มบัญชี"}
        </button>
      </div>

      {current.length === 0 ? (
        <p className="text-[12.5px] leading-5 text-muted-foreground">
          ยังไม่มีบัญชี Shipnity — เพิ่มได้จากแบบฟอร์มด้านบน
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-[12px] text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
