"use client";

import { Button } from "@/components/ui/button";
import { IconPrinter } from "./icons";

export function PrintButton() {
  return (
    <Button
      type="button"
      variant="default"
      className="no-print"
      aria-label="พิมพ์ หรือ บันทึก PDF"
      onClick={() => window.print()}
    >
      <IconPrinter size={17} />
      พิมพ์ / บันทึก PDF
    </Button>
  );
}
