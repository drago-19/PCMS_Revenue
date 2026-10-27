"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon, KeyRoundIcon, LockIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { AppMark } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function LoginFormCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  const nextParam = searchParams.get("next");
  const targetPath =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน");
      return;
    }

    setLoading(true);
    setError(null);
    setLockedMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUser, password }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        remainingAttempts?: number;
        retryAfterSeconds?: number;
      };

      if (response.status === 429) {
        const msg =
          payload.error ??
          "กรอกรหัสผ่านผิดเกินกำหนด ระบบระงับการเข้าสู่ระบบชั่วคราว 15 นาที";
        setLockedMessage(msg);
        toast.error(msg);
        return;
      }

      if (!response.ok || !payload.ok) {
        const msg = payload.error ?? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
        setError(msg);
        return;
      }

      toast.success("เข้าสู่ระบบสำเร็จ");
      window.location.assign(targetPath);
      return;
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-[440px] overflow-hidden border-[#cbd5e1] bg-white shadow-[0_20px_44px_rgba(15,23,42,0.12)]">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#00f2ea] via-[#fe2c55] to-[#0f172a]" />

      <CardHeader className="gap-3 border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-5 min-[640px]:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="brand-mark">
              <AppMark size={40} />
            </span>
            <div className="flex flex-col">
              <span className="text-[16px] font-extrabold tracking-tight text-[#0f172a]">
                PCMS Revenue
              </span>
              <span className="text-[12px] font-medium text-[#475569]">
                TikTok Shop · Seller Finance Portal
              </span>
            </div>
          </div>
          <Badge variant="success" className="shrink-0">
            <ShieldCheckIcon className="size-3.5" />
            Protected
          </Badge>
        </div>

        <div className="pt-1">
          <CardTitle className="text-[20px] font-extrabold text-[#0f172a]">
            เข้าสู่ระบบจัดการรายได้
          </CardTitle>
          <CardDescription className="mt-1 text-[13.5px] text-[#475569]">
            กรุณายืนยันตัวตนก่อนเข้าดูบิล ใบกำกับภาษี และไฟล์การเงินของบริษัท
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="flex flex-col gap-4 px-5 py-5 min-[640px]:px-6">
          {lockedMessage ? (
            <div
              role="alert"
              className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3.5 text-[13px] font-semibold text-[#b91c1c]"
            >
              <div className="flex items-center gap-2 font-bold">
                <LockIcon className="size-4 shrink-0 text-[#dc2626]" />
                <span>ระบบล็อกการเข้าสู่ระบบชั่วคราว (Brute-Force Protection)</span>
              </div>
              <p className="mt-1 font-normal leading-relaxed">{lockedMessage}</p>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13px] font-semibold text-[#b91c1c]"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-username"
              className="text-[13px] font-bold text-[#0f172a]"
            >
              ชื่อผู้ใช้ (Username)
            </label>
            <div className="relative flex items-center">
              <UserIcon
                style={{ left: "14px" }}
                className="pointer-events-none absolute left-3.5 size-4 text-[#64748b]"
              />
              <Input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                placeholder="กรอกชื่อผู้ใช้"
                style={{ paddingLeft: "40px" }}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-password"
              className="text-[13px] font-bold text-[#0f172a]"
            >
              รหัสผ่าน (Password)
            </label>
            <div className="relative flex items-center">
              <KeyRoundIcon
                style={{ left: "14px" }}
                className="pointer-events-none absolute left-3.5 size-4 text-[#64748b]"
              />
              <Input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="กรอกรหัสผ่านเข้าสู่ระบบ"
                style={{ paddingLeft: "40px", paddingRight: "44px" }}
                className="pr-12 pl-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                style={{ right: "2px" }}
                className="absolute right-0.5 size-10 text-[#475569] hover:bg-transparent hover:text-[#0f172a]"
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            variant="default"
            size="lg"
            loading={loading}
            disabled={loading}
            className="mt-1 w-full text-[15px] font-bold"
          >
            <LockIcon className="size-4" />
            {loading ? "กำลังตรวจสอบสิทธิ์..." : "เข้าสู่ระบบ"}
          </Button>
        </CardContent>
      </form>

      <CardFooter className="flex flex-col items-start gap-1.5 border-t border-[#e2e8f0] bg-[#f8fafc] px-5 py-3.5 text-[12px] text-[#475569] min-[640px]:px-6">
        <div className="flex items-center gap-2 font-semibold text-[#0f172a]">
          <ShieldCheckIcon className="size-4 text-[#059669]" />
          <span>ระบบรักษาความปลอดภัยระดับ Production</span>
        </div>
        <span className="leading-relaxed">
          เข้ารหัสรหัสผ่านด้วย bcrypt (cost 12) · ล็อกอัตโนมัติ 15 นาทีเมื่อกรอกผิดครบ 5 ครั้ง · บันทึก Audit Trail ทุกการเข้าถึง
        </span>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div
      data-login-page="true"
      className="flex min-h-[calc(100dvh-48px)] w-full flex-col items-center justify-center px-2 py-6"
    >
      <style>{`
        .app-shell:has([data-login-page="true"]) {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      `}</style>
      <Suspense fallback={<div className="text-sm text-[#475569]">กำลังโหลดหน้าเข้าสู่ระบบ...</div>}>
        <LoginFormCard />
      </Suspense>
    </div>
  );
}
