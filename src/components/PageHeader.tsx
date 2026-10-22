import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full bg-[#fe2c55] shadow-[2px_0_0_#00f2ea]"
              aria-hidden="true"
            />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions no-print">{actions}</div> : null}
    </header>
  );
}

const statCardVariants = cva("stat", {
  variants: {
    tone: {
      default: "tone-default",
      brand: "tone-brand",
      positive: "tone-positive",
      negative: "tone-negative",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
} & VariantProps<typeof statCardVariants>) {
  return (
    <Card padding="stat" className={cn(statCardVariants({ tone }))}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon ? <span className="stat-icon">{icon}</span> : null}
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "warning") {
    return <Badge variant="warning">มีคำเตือน</Badge>;
  }
  return <Badge variant="success">ปกติ</Badge>;
}

export function MoneyDiffBadge({
  matched,
}: {
  matched: boolean | null;
}) {
  if (matched === true) {
    return <Badge variant="success">ตรงกับชีตสรุป</Badge>;
  }
  if (matched === false) {
    return <Badge variant="destructive">ยอดไม่ตรง</Badge>;
  }
  return <Badge variant="neutral">ไม่มีชีตสรุป</Badge>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </Card>
  );
}
