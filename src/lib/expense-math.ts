export type ExpenseVatType = "none" | "exclude" | "include";
export type ExpensePaymentStatus = "paid" | "pending" | "void";
export type ExpensePaymentMethod =
  | "transfer"
  | "cash"
  | "credit_card"
  | "platform_deduct";

export interface ExpenseCategory {
  id: number;
  name: string;
  accountCode: string;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface ExpenseRecord {
  id: number;
  documentNo: string;
  entryDate: string;
  yearMonth: string;
  categoryId: number;
  categoryName: string;
  categoryAccountCode: string;
  categoryColor: string;
  amount: number;
  subtotalAmount: number;
  vatType: ExpenseVatType;
  vatAmount: number;
  whtRate: number;
  whtAmount: number;
  netPaidAmount: number;
  vendorName: string;
  vendorTaxId: string;
  taxInvoiceNo: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod: ExpensePaymentMethod;
  attachmentUrl: string | null;
  attachmentName: string | null;
  title: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyPlatformRevenue {
  yearMonth: string;
  orderCount: number;
  tiktokPayout: number;
  shopeePayout: number;
  facebookPayout: number;
  lazadaPayout: number;
  linePayout: number;
  otherPayout: number;
  totalPlatformPayout: number;
  totalIncome: number;
}

export interface MonthlyExpenseRow {
  yearMonth: string;
  orderCount: number;
  tiktokPayout: number;
  shopeePayout: number;
  facebookPayout: number;
  lazadaPayout: number;
  linePayout: number;
  otherPayout: number;
  totalPlatformPayout: number;
  totalIncome: number;
  categoryAmounts: Record<number, number>;
  directAmounts: Record<number, number>;
  categoryItemCounts: Record<number, number>;
  totalExpenses: number;
  netRemaining: number;
  profitMarginPercent: number | null;
}

export interface ExpenseLedgerStats {
  totalRecordsCount: number;
  paidCount: number;
  paidAmount: number;
  pendingCount: number;
  pendingAmount: number;
  voidCount: number;
  vatRecordCount: number;
  vatInputTotal: number;
  whtRecordCount: number;
  whtTotal: number;
}

export interface ExpensesOverviewData {
  categories: ExpenseCategory[];
  rows: MonthlyExpenseRow[];
  records: ExpenseRecord[];
  ledgerStats: ExpenseLedgerStats;
  totalStats: {
    totalPlatformPayout: number;
    totalExpenses: number;
    netRemaining: number;
    profitMarginPercent: number | null;
    monthsCount: number;
  };
  availableYears: string[];
}

export const DEFAULT_ACCOUNTING_CATEGORIES: ReadonlyArray<{
  accountCode: string;
  name: string;
  color: string;
}> = [
  {
    accountCode: "51020.01",
    name: "การตลาดและโฆษณา",
    color: "rose",
  },
  {
    accountCode: "51020.02",
    name: "วัสดุสิ้นเปลืองและแพ็คเกจจิ้ง",
    color: "amber",
  },
  {
    accountCode: "51020.03",
    name: "ค่าขนส่งและโลจิสติกส์",
    color: "blue",
  },
  {
    accountCode: "53010.01",
    name: "เงินเดือนและค่าแรงพนักงาน",
    color: "emerald",
  },
  {
    accountCode: "53031.01",
    name: "ค่าไฟฟ้า",
    color: "amber",
  },
  {
    accountCode: "53031.02",
    name: "ค่าน้ำประปา",
    color: "cyan",
  },
  {
    accountCode: "53031.03",
    name: "ค่าโทรศัพท์และอินเทอร์เน็ต",
    color: "blue",
  },
  {
    accountCode: "53032.02",
    name: "ค่าเช่าสำนักงานและอาคาร",
    color: "purple",
  },
  {
    accountCode: "53032.06",
    name: "ค่ารักษาความสะอาดและบริการ",
    color: "slate",
  },
  {
    accountCode: "12612",
    name: "คอมพิวเตอร์และอุปกรณ์สำนักงาน",
    color: "purple",
  },
];

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function normalizeVatType(val: unknown): ExpenseVatType {
  if (val === "exclude" || val === "include") return val;
  return "none";
}

export function normalizePaymentStatus(val: unknown): ExpensePaymentStatus {
  if (val === "pending" || val === "void") return val;
  return "paid";
}

export function normalizePaymentMethod(val: unknown): ExpensePaymentMethod {
  if (
    val === "cash" ||
    val === "credit_card" ||
    val === "platform_deduct" ||
    val === "transfer"
  ) {
    return val;
  }
  return "transfer";
}

export function calculateExpenseTaxAmounts(
  inputAmount: number,
  vatType: ExpenseVatType = "none",
  whtRate = 0,
): {
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  whtRate: number;
  whtAmount: number;
  netPaidAmount: number;
} {
  const base = Math.max(0, round2(inputAmount));
  const cleanWhtRate = Math.max(0, Math.min(100, round2(whtRate)));

  let subtotalAmount = base;
  let vatAmount = 0;
  let totalAmount = base;

  if (vatType === "exclude") {
    subtotalAmount = base;
    vatAmount = round2(base * 0.07);
    totalAmount = round2(subtotalAmount + vatAmount);
  } else if (vatType === "include") {
    totalAmount = base;
    subtotalAmount = round2(base / 1.07);
    vatAmount = round2(totalAmount - subtotalAmount);
  }

  const whtAmount =
    cleanWhtRate > 0 ? round2(subtotalAmount * (cleanWhtRate / 100)) : 0;
  const netPaidAmount = Math.max(0, round2(totalAmount - whtAmount));

  return {
    subtotalAmount,
    vatAmount,
    totalAmount,
    whtRate: cleanWhtRate,
    whtAmount,
    netPaidAmount,
  };
}
