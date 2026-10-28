"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconPrinter } from "./icons";

export function PrintButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="default"
      className={cn("no-print", className)}
      aria-label="พิมพ์ หรือ บันทึก PDF"
      onClick={() => window.print()}
    >
      <IconPrinter size={17} />
      พิมพ์ / บันทึก PDF
    </Button>
  );
}
