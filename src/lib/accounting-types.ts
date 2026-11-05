export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type NormalBalance = "debit" | "credit";

export type JournalBookType = "JV" | "UV" | "SV" | "PV" | "RV";

export type JournalEntryStatus = "approved" | "pending" | "void";

export interface ChartOfAccount {
  id: number;
  accountCode: string;
  accountName: string;
  description: string;
  accountType: AccountType;
  primaryGroup: string;
  secondaryGroup: string;
  normalBalance: NormalBalance;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
}

export interface JournalVoucher {
  id: string;
  dbId?: number;
  documentNo: string;
  journalType: JournalBookType;
  entryDate: string;
  yearMonth: string;
  contactName: string;
  referenceNo: string;
  description: string;
  remarks: string;
  totalDebit: number;
  totalCredit: number;
  status: JournalEntryStatus;
  sourceType: "manual" | "sales" | "receipt" | "expense_purchase" | "expense_payment";
  channel?: string;
  lines: JournalEntryLine[];
  createdAt?: string;
}

export interface LedgerMovementItem {
  voucherId: string;
  documentNo: string;
  journalType: JournalBookType;
  entryDate: string;
  contactName: string;
  description: string;
  memo: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: JournalEntryStatus;
}

export interface GeneralLedgerAccountRow extends ChartOfAccount {
  totalDebit: number;
  totalCredit: number;
  endingBalance: number;
  movementCount: number;
  movements: LedgerMovementItem[];
}

export interface AccountingCategoryCounts {
  all: number;
  asset: number;
  liability: number;
  equity: number;
  revenue: number;
  expense: number;
}

export interface JournalBookCounts {
  all: number;
  JV: number;
  UV: number;
  SV: number;
  PV: number;
  RV: number;
}

export interface AccountingSummaryMetrics {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  totalJournalDebit: number;
  totalJournalCredit: number;
}

export interface AccountingOverviewData {
  selectedYear: string;
  availableYears: string[];
  availableMonths: string[];
  accounts: GeneralLedgerAccountRow[];
  journals: JournalVoucher[];
  categoryCounts: AccountingCategoryCounts;
  journalCounts: JournalBookCounts;
  summary: AccountingSummaryMetrics;
}

export const ACCOUNT_TYPE_META: Record<
  AccountType,
  {
    label: string;
    shortLabel: string;
    codePrefix: string;
    normalBalance: NormalBalance;
    badgeClass: string;
    defaultPrimaryGroup: string;
    defaultSecondaryGroup: string;
  }
> = {
  asset: {
    label: "สินทรัพย์",
    shortLabel: "สินทรัพย์ (1xxxx)",
    codePrefix: "1",
    normalBalance: "debit",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    defaultPrimaryGroup: "สินทรัพย์หมุนเวียน",
    defaultSecondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
  },
  liability: {
    label: "หนี้สิน",
    shortLabel: "หนี้สิน (2xxxx)",
    codePrefix: "2",
    normalBalance: "credit",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    defaultPrimaryGroup: "หนี้สินหมุนเวียน",
    defaultSecondaryGroup: "เจ้าหนี้การค้าและเจ้าหนี้หมุนเวียนอื่น",
  },
  equity: {
    label: "ส่วนของผู้ถือหุ้น",
    shortLabel: "ส่วนของผู้ถือหุ้น (3xxxx)",
    codePrefix: "3",
    normalBalance: "credit",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    defaultPrimaryGroup: "ส่วนของผู้ถือหุ้น",
    defaultSecondaryGroup: "ทุนเรือนหุ้นและกำไรสะสม",
  },
  revenue: {
    label: "รายได้",
    shortLabel: "รายได้ (4xxxx)",
    codePrefix: "4",
    normalBalance: "credit",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    defaultPrimaryGroup: "รายได้หลัก",
    defaultSecondaryGroup: "รายได้จากการขายสินค้าและบริการ",
  },
  expense: {
    label: "ค่าใช้จ่าย",
    shortLabel: "ค่าใช้จ่าย (5xxxx)",
    codePrefix: "5",
    normalBalance: "debit",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    defaultPrimaryGroup: "ค่าใช้จ่ายในการดำเนินงาน",
    defaultSecondaryGroup: "ค่าใช้จ่ายในการขายและบริหาร",
  },
};

export const JOURNAL_BOOK_META: Record<
  JournalBookType,
  {
    code: JournalBookType;
    label: string;
    shortLabel: string;
    description: string;
    badgeClass: string;
  }
> = {
  JV: {
    code: "JV",
    label: "สมุดรายวันทั่วไป",
    shortLabel: "สมุดรายวันทั่วไป",
    description: "บันทึกยอดยกมา ปรับปรุงบัญชี ตั้งค้างจ่าย ปิดภาษีมูลค่าเพิ่ม และรายการทั่วไป",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  UV: {
    code: "UV",
    label: "สมุดรายวันซื้อ",
    shortLabel: "สมุดรายวันซื้อ",
    description: "เชื่อมอัตโนมัติจากบิลค่าใช้จ่ายและภาษีซื้อ ภ.พ.30",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  SV: {
    code: "SV",
    label: "สมุดรายวันขาย",
    shortLabel: "สมุดรายวันขาย",
    description: "เชื่อมอัตโนมัติจากยอดขายและเงินชดเชยแยกตามช่องทางจำหน่าย",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  PV: {
    code: "PV",
    label: "สมุดรายวันจ่าย",
    shortLabel: "สมุดรายวันจ่าย",
    description: "เชื่อมอัตโนมัติจากบิลค่าใช้จ่ายที่ชำระเงินแล้ว พร้อมภาษีหัก ณ ที่จ่าย",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  },
  RV: {
    code: "RV",
    label: "สมุดรายวันรับ",
    shortLabel: "สมุดรายวันรับ",
    description: "เชื่อมอัตโนมัติจากยอดเงินรับสุทธิจากแต่ละช่องทางจำหน่ายเข้าธนาคาร",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
  },
};

export interface DefaultSeedAccount {
  accountCode: string;
  accountName: string;
  description: string;
  accountType: AccountType;
  primaryGroup: string;
  secondaryGroup: string;
  normalBalance: NormalBalance;
  sortOrder: number;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultSeedAccount[] = [
  // 1. สินทรัพย์ (Assets) — ตรงตามภาพหน้าจอ FlowAccount ของ CEO
  {
    accountCode: "11111",
    accountName: "เงินสดในมือ",
    description: "เงินสดรับ-จ่ายในกิจการ",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 10,
  },
  {
    accountCode: "11112",
    accountName: "เงินสดคงเหลือ",
    description: "เงินสดคงเหลือประจำงวดในกิจการ",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 20,
  },
  {
    accountCode: "11115",
    accountName: "เงินสดย่อย",
    description: "วงเงินสดย่อยสำหรับค่าใช้จ่ายเบ็ดเตล็ด",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 30,
  },
  {
    accountCode: "11121.01",
    accountName: "กสิกรไทย (บัญชีกระแสรายวัน/ออมทรัพย์หลัก)",
    description: "บัญชีธนาคารหลักสำหรับรับเงินโอน Settlement และจ่ายค่าใช้จ่าย",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 40,
  },
  {
    accountCode: "11122.01",
    accountName: "กสิกรไทย (บัญชีออมทรัพย์สำรอง)",
    description: "บัญชีเงินฝากออมทรัพย์สำรองของบริษัท",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 50,
  },
  {
    accountCode: "11130",
    accountName: "เช็คในมือ",
    description: "เช็คที่ได้รับจากลูกหนี้การค้ารอนำฝากธนาคาร",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 60,
  },
  {
    accountCode: "11140",
    accountName: "รายการเทียบเท่าเงินสด",
    description: "กระเป๋าเงินอิเล็กทรอนิกส์ / E-Wallet แพลตฟอร์ม",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินสดและรายการเทียบเท่าเงินสด",
    normalBalance: "debit",
    sortOrder: 70,
  },
  {
    accountCode: "11290",
    accountName: "เงินลงทุนชั่วคราวอื่น",
    description: "เงินฝากประจำระยะสั้นหรือกองทุนตลาดเงิน",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "เงินลงทุนชั่วคราว",
    normalBalance: "debit",
    sortOrder: 80,
  },
  {
    accountCode: "11311",
    accountName: "ลูกหนี้การค้า - ทั่วไป / แพลตฟอร์ม E-Commerce",
    description: "ลูกหนี้การค้ารอโอนเงินจาก TikTok Shop, Shopee, Facebook, Lazada, LINE",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "ลูกหนี้การค้าและลูกหนี้หมุนเวียนอื่น",
    normalBalance: "debit",
    sortOrder: 90,
  },
  {
    accountCode: "11510",
    accountName: "สินค้าคงเหลือ",
    description: "สต็อกเสื้อผ้า สินค้าสำเร็จรูป และวัสดุแพ็คกิ้งคงเหลือ",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "สินค้าคงเหลือ",
    normalBalance: "debit",
    sortOrder: 100,
  },
  {
    accountCode: "12612",
    accountName: "อุปกรณ์สำนักงานและคอมพิวเตอร์",
    description: "คอมพิวเตอร์ เครื่องพิมพ์ใบปะหน้า กล้องไลฟ์สด และอุปกรณ์สำนักงาน",
    accountType: "asset",
    primaryGroup: "สินทรัพย์ไม่หมุนเวียน",
    secondaryGroup: "อาคารและอุปกรณ์",
    normalBalance: "debit",
    sortOrder: 110,
  },
  {
    accountCode: "17111",
    accountName: "ภาษีซื้อ 7%",
    description: "ภาษีมูลค่าเพิ่มจากการซื้อสินค้าและบริการที่มีใบกำกับภาษีเต็มรูป",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "สินทรัพย์หมุนเวียนอื่น",
    normalBalance: "debit",
    sortOrder: 120,
  },
  {
    accountCode: "17112",
    accountName: "ภาษีซื้อยังไม่ถึงกำหนด",
    description: "ภาษีซื้อจากใบแจ้งหนี้บริการที่ยังไม่ได้รับใบกำกับภาษี",
    accountType: "asset",
    primaryGroup: "สินทรัพย์หมุนเวียน",
    secondaryGroup: "สินทรัพย์หมุนเวียนอื่น",
    normalBalance: "debit",
    sortOrder: 130,
  },

  // 2. หนี้สิน (Liabilities)
  {
    accountCode: "21210",
    accountName: "เจ้าหนี้การค้า - ทั่วไป",
    description: "เจ้าหนี้ค่าสินค้าและค่าใช้จ่ายค้างจ่าย (บิลรายจ่ายที่รอชำระ)",
    accountType: "liability",
    primaryGroup: "หนี้สินหมุนเวียน",
    secondaryGroup: "เจ้าหนี้การค้าและเจ้าหนี้หมุนเวียนอื่น",
    normalBalance: "credit",
    sortOrder: 200,
  },
  {
    accountCode: "21390",
    accountName: "ค่าใช้จ่ายค้างจ่าย",
    description: "เงินเดือนค้างจ่าย ค่าสาธารณูปโภคค้างจ่าย และค่าบริการค้างจ่าย",
    accountType: "liability",
    primaryGroup: "หนี้สินหมุนเวียน",
    secondaryGroup: "เจ้าหนี้การค้าและเจ้าหนี้หมุนเวียนอื่น",
    normalBalance: "credit",
    sortOrder: 210,
  },
  {
    accountCode: "27111",
    accountName: "ภาษีขาย 7%",
    description: "ภาษีมูลค่าเพิ่มจากการขายสินค้าตามใบกำกับภาษี",
    accountType: "liability",
    primaryGroup: "หนี้สินหมุนเวียน",
    secondaryGroup: "หนี้สินหมุนเวียนอื่น",
    normalBalance: "credit",
    sortOrder: 220,
  },
  {
    accountCode: "27115",
    accountName: "เจ้าหนี้กรมสรรพากร (ภ.พ.30 รอชำระ)",
    description: "ยอดภาษีมูลค่าเพิ่มสุทธิที่ต้องนำส่งกรมสรรพากรประจำเดือน",
    accountType: "liability",
    primaryGroup: "หนี้สินหมุนเวียน",
    secondaryGroup: "หนี้สินหมุนเวียนอื่น",
    normalBalance: "credit",
    sortOrder: 230,
  },
  {
    accountCode: "27120",
    accountName: "ภาษีหัก ณ ที่จ่ายค้างจ่าย (ภ.ง.ด.1/3/53)",
    description: "ภาษีหัก ณ ที่จ่ายที่หักจากผู้จำหน่าย/พนักงาน รอนำส่งกรมสรรพากร",
    accountType: "liability",
    primaryGroup: "หนี้สินหมุนเวียน",
    secondaryGroup: "หนี้สินหมุนเวียนอื่น",
    normalBalance: "credit",
    sortOrder: 240,
  },
  {
    accountCode: "27140",
    accountName: "เงินสมทบประกันสังคมค้างจ่าย",
    description: "เงินสมทบกองทุนประกันสังคมส่วนลูกจ้างและนายจ้างรอนำส่ง",
    accountType: "liability",
    primaryGroup: "หนี้สินหมุนเวียน",
    secondaryGroup: "หนี้สินหมุนเวียนอื่น",
    normalBalance: "credit",
    sortOrder: 250,
  },

  // 3. ส่วนของผู้ถือหุ้น (Equity)
  {
    accountCode: "31000",
    accountName: "ทุนจดทะเบียนชำระแล้ว",
    description: "ทุนเรือนหุ้นสามัญที่ชำระแล้วของบริษัท",
    accountType: "equity",
    primaryGroup: "ส่วนของผู้ถือหุ้น",
    secondaryGroup: "ทุนเรือนหุ้น",
    normalBalance: "credit",
    sortOrder: 300,
  },
  {
    accountCode: "32000",
    accountName: "กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร",
    description: "กำไรสะสมยกมาและผลการดำเนินงานสะสมของกิจการ",
    accountType: "equity",
    primaryGroup: "ส่วนของผู้ถือหุ้น",
    secondaryGroup: "กำไรสะสม",
    normalBalance: "credit",
    sortOrder: 310,
  },

  // 4. รายได้ (Revenue)
  {
    accountCode: "41010.01",
    accountName: "รายได้จากการขาย - TikTok Shop",
    description: "ยอดขายสินค้าจากช่องทาง TikTok Shop",
    accountType: "revenue",
    primaryGroup: "รายได้หลัก",
    secondaryGroup: "รายได้จากการขายสินค้า",
    normalBalance: "credit",
    sortOrder: 400,
  },
  {
    accountCode: "41010.02",
    accountName: "รายได้จากการขาย - Shopee",
    description: "ยอดขายสินค้าจากช่องทาง Shopee",
    accountType: "revenue",
    primaryGroup: "รายได้หลัก",
    secondaryGroup: "รายได้จากการขายสินค้า",
    normalBalance: "credit",
    sortOrder: 410,
  },
  {
    accountCode: "41010.03",
    accountName: "รายได้จากการขาย - Facebook",
    description: "ยอดขายสินค้าจากช่องทาง Facebook",
    accountType: "revenue",
    primaryGroup: "รายได้หลัก",
    secondaryGroup: "รายได้จากการขายสินค้า",
    normalBalance: "credit",
    sortOrder: 420,
  },
  {
    accountCode: "41010.04",
    accountName: "รายได้จากการขาย - Lazada",
    description: "ยอดขายสินค้าจากช่องทาง Lazada",
    accountType: "revenue",
    primaryGroup: "รายได้หลัก",
    secondaryGroup: "รายได้จากการขายสินค้า",
    normalBalance: "credit",
    sortOrder: 430,
  },
  {
    accountCode: "41010.05",
    accountName: "รายได้จากการขาย - LINE / ช่องทางอื่น",
    description: "ยอดขายสินค้าจากช่องทาง LINE OA และช่องทางตรง",
    accountType: "revenue",
    primaryGroup: "รายได้หลัก",
    secondaryGroup: "รายได้จากการขายสินค้า",
    normalBalance: "credit",
    sortOrder: 440,
  },
  {
    accountCode: "42010",
    accountName: "รายได้เงินชดเชยจากแพลตฟอร์มและโลจิสติกส์",
    description: "เงินชดเชยพัสดุสูญหาย/เสียหาย และเงินสนับสนุนจากแพลตฟอร์ม",
    accountType: "revenue",
    primaryGroup: "รายได้อื่น",
    secondaryGroup: "รายได้อื่นจากการดำเนินงาน",
    normalBalance: "credit",
    sortOrder: 450,
  },

  // 5. ค่าใช้จ่าย (Expenses)
  {
    accountCode: "51010",
    accountName: "ต้นทุนขายและต้นทุนผลิตสินค้า",
    description: "ต้นทุนเสื้อผ้า ผ้า ค่าตัดเย็บ และต้นทุนสินค้าเพื่อขาย",
    accountType: "expense",
    primaryGroup: "ต้นทุนขายและบริการ",
    secondaryGroup: "ต้นทุนขายสินค้า",
    normalBalance: "debit",
    sortOrder: 500,
  },
  {
    accountCode: "51020",
    accountName: "ค่าธรรมเนียมแพลตฟอร์มและค่าขนส่งที่ร้านรับภาระ",
    description: "ค่าคอมมิชชั่น ค่าธรรมเนียมการชำระเงิน และค่าส่งที่หักจากยอดขายแพลตฟอร์ม",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการขาย",
    secondaryGroup: "ค่าธรรมเนียมการขายและค่าขนส่ง",
    normalBalance: "debit",
    sortOrder: 505,
  },
  {
    accountCode: "51020.01",
    accountName: "ต้นทุนสินค้า / สต็อก (บิลซื้อเข้า)",
    description: "ค่าซื้อสินค้าและวัตถุดิบตามบิลรายจ่าย",
    accountType: "expense",
    primaryGroup: "ต้นทุนขายและบริการ",
    secondaryGroup: "ต้นทุนขายสินค้า",
    normalBalance: "debit",
    sortOrder: 510,
  },
  {
    accountCode: "51020.02",
    accountName: "ค่ากล่องและอุปกรณ์แพ็คกิ้ง",
    description: "ค่ากล่องพัสดุ ซองพลาสติก เทปกาว สติกเกอร์ใบปะหน้า",
    accountType: "expense",
    primaryGroup: "ต้นทุนขายและบริการ",
    secondaryGroup: "วัสดุสิ้นเปลืองในการจัดส่ง",
    normalBalance: "debit",
    sortOrder: 520,
  },
  {
    accountCode: "53010.01",
    accountName: "ค่าโฆษณาการตลาด",
    description: "ค่าโฆษณาและค่าส่งเสริมการขายออนไลน์",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการขาย",
    secondaryGroup: "ค่าโฆษณาและส่งเสริมการขาย",
    normalBalance: "debit",
    sortOrder: 530,
  },
  {
    accountCode: "53010.02",
    accountName: "ค่าขนส่งและโลจิสติกส์",
    description: "ค่าจ้างรถขนส่ง ค่าส่งสินค้าไปโกดัง และค่าจัดส่งด่วน",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการขาย",
    secondaryGroup: "ค่าขนส่งในการขาย",
    normalBalance: "debit",
    sortOrder: 540,
  },
  {
    accountCode: "53031.01",
    accountName: "เงินเดือนและค่าแรงพนักงาน",
    description: "เงินเดือนพนักงานประจำ ค่าแรงแอดมิน พนักงานแพ็คของ และไลฟ์สด",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการบริหาร",
    secondaryGroup: "ค่าใช้จ่ายเกี่ยวกับพนักงาน",
    normalBalance: "debit",
    sortOrder: 550,
  },
  {
    accountCode: "53031.02",
    accountName: "เงินสมทบประกันสังคมและสวัสดิการ",
    description: "เงินสมทบประกันสังคมส่วนนายจ้าง OT และสวัสดิการพนักงาน",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการบริหาร",
    secondaryGroup: "ค่าใช้จ่ายเกี่ยวกับพนักงาน",
    normalBalance: "debit",
    sortOrder: 560,
  },
  {
    accountCode: "53032.01",
    accountName: "ค่าเช่าสำนักงานและคลังสินค้า",
    description: "ค่าเช่าออฟฟิศ โกดังเก็บสินค้า และสตูดิโอไลฟ์สด",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการบริหาร",
    secondaryGroup: "ค่าเช่าและค่าใช้จ่ายอาคารสถานที่",
    normalBalance: "debit",
    sortOrder: 570,
  },
  {
    accountCode: "53032.02",
    accountName: "ค่าน้ำ ค่าไฟ ค่าอินเทอร์เน็ต",
    description: "ค่าสาธารณูปโภคประจำสำนักงานและคลังสินค้า",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการบริหาร",
    secondaryGroup: "ค่าสาธารณูปโภค",
    normalBalance: "debit",
    sortOrder: 580,
  },
  {
    accountCode: "53032.06",
    accountName: "ค่าซอฟต์แวร์และค่าธรรมเนียมบัญชี",
    description: "ค่าระบบจัดการออเดอร์ ค่าสำนักงานบัญชี และค่าธรรมเนียมธนาคาร",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการบริหาร",
    secondaryGroup: "ค่าบริการวิชาชีพและซอฟต์แวร์",
    normalBalance: "debit",
    sortOrder: 590,
  },
  {
    accountCode: "53032.99",
    accountName: "ค่าใช้จ่ายในการบริหารและเบ็ดเตล็ดอื่น",
    description: "ค่าใช้จ่ายดำเนินงานทั่วไปที่ไม่ได้จัดเข้าหมวดเฉพาะ",
    accountType: "expense",
    primaryGroup: "ค่าใช้จ่ายในการบริหาร",
    secondaryGroup: "ค่าใช้จ่ายบริหารอื่น",
    normalBalance: "debit",
    sortOrder: 600,
  },
];

export function inferAccountTypeFromCode(code: string): AccountType {
  const trimmed = code.trim();
  if (trimmed.startsWith("1")) return "asset";
  if (trimmed.startsWith("2")) return "liability";
  if (trimmed.startsWith("3")) return "equity";
  if (trimmed.startsWith("4")) return "revenue";
  return "expense";
}

export function inferNormalBalance(type: AccountType): NormalBalance {
  return ACCOUNT_TYPE_META[type]?.normalBalance ?? "debit";
}

export function calculateAccountEndingBalance(
  normalBalance: NormalBalance,
  totalDebit: number,
  totalCredit: number,
): number {
  const dr = Math.round((Number(totalDebit) || 0) * 100) / 100;
  const cr = Math.round((Number(totalCredit) || 0) * 100) / 100;
  const raw = normalBalance === "debit" ? dr - cr : cr - dr;
  return Math.round(raw * 100) / 100;
}

export function validateJournalEntryLines(lines: JournalEntryLine[]): {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  diff: number;
  error?: string;
} {
  const activeLines = lines.filter(
    (l) =>
      l.accountCode.trim() !== "" &&
      ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0),
  );

  if (activeLines.length < 2) {
    return {
      valid: false,
      totalDebit: 0,
      totalCredit: 0,
      diff: 0,
      error: "สมุดรายวันต้องมีอย่างน้อย 2 บรรทัดรายการ (ฝั่งเดบิตและฝั่งเครดิต)",
    };
  }

  for (const line of activeLines) {
    const dr = Number(line.debit) || 0;
    const cr = Number(line.credit) || 0;
    if (dr < 0 || cr < 0) {
      return {
        valid: false,
        totalDebit: 0,
        totalCredit: 0,
        diff: 0,
        error: "ยอดเดบิตและเครดิตต้องไม่ติดลบ",
      };
    }
    if (dr > 0 && cr > 0) {
      return {
        valid: false,
        totalDebit: 0,
        totalCredit: 0,
        diff: 0,
        error: `บัญชี ${line.accountCode} ห้ามใส่ทั้งเดบิตและเครดิตในบรรทัดเดียวกัน`,
      };
    }
  }

  const totalDebit =
    Math.round(
      activeLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0) * 100,
    ) / 100;
  const totalCredit =
    Math.round(
      activeLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0) * 100,
    ) / 100;
  const diff = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;

  if (totalDebit <= 0 || totalCredit <= 0) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      diff,
      error: "กรุณาระบุจำนวนเงินฝั่งเดบิตและเครดิตให้มากกว่า 0.00 บาท",
    };
  }

  if (diff > 0.009) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      diff,
      error: `ยอดรวมเดบิต (${totalDebit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}) ไม่เท่ากับยอดรวมเครดิต (${totalCredit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}) ผลต่าง ${diff.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`,
    };
  }

  return {
    valid: true,
    totalDebit,
    totalCredit,
    diff: 0,
  };
}
