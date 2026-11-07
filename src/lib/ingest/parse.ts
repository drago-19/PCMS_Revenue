import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS, { type CellValue } from "exceljs";
import {
  FEE_GROUPS,
  FIELD_BY_KEY,
  isMoneyLikeHeader,
  isOrderType,
  matchHeader,
  normalizeHeader,
  type FieldKind,
  type FieldDef,
} from "./catalog";
import { round2 } from "../format";
import {
  lookupCustomFieldKey,
  lookupUnknownColumnCategory,
  type UnknownColumnCategory,
} from "../column-mapping-settings";

export type Primitive = string | number | boolean | Date | null;

export interface ParseWorkbookOptions {
  customMapping?: Record<string, string>;
  unknownColumnCategories?: Record<string, UnknownColumnCategory>;
  preloadedSheets?: { name: string; rows: Primitive[][] }[];
}

export interface IngestWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  row?: number;
}

export interface MappingEntry {
  col: number;
  header: string;
  fieldKey: string | null;
  label: string | null;
  kind: FieldKind | null;
  confidence: "exact" | "canonical" | "fuzzy" | "unmapped";
  nonEmpty: number;
}

export interface UnknownColumn {
  col: number;
  header: string;
  nonEmpty: number;
  nonZeroNumeric: number;
  moneyLike: boolean;
  samples: string[];
  category?: UnknownColumnCategory;
}

export interface ReportSummary {
  found: boolean;
  sheetName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  timezone: string | null;
  currency: string | null;
  totals: Record<string, number>;
  raw: { label: string; value: string }[];
}

export interface FeeGroupValue {
  total: number;
  children: Record<string, number>;
}

export interface TransactionChecks {
  incomeDiff: number;
  feeDiff: number;
  payoutDiff: number;
}

export interface UnknownValue {
  header: string;
  amount: number;
  moneyLike: boolean;
  category?: UnknownColumnCategory;
}

export interface NormalizedTransaction {
  externalId: string;
  transactionType: string;
  isOrder: boolean;
  createdAt: string;
  paidAt: string;
  currency: string;
  fields: Record<string, string | number>;
  mappedFields: string[];
  feeGroups: Record<string, FeeGroupValue>;
  unknownValues: UnknownValue[];
  checks: TransactionChecks;
  warnings: IngestWarning[];
  raw: Record<string, string | number>;
  sourceRows: number;
  firstRow: number;
  rowIndexes: number[];
}

export interface ParsedWorkbook {
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: MappingEntry[];
  unknownColumns: UnknownColumn[];
  transactions: NormalizedTransaction[];
  report: ReportSummary;
  warnings: IngestWarning[];
  headerSignature: string;
  dataRowCount: number;
}

export class IngestError extends Error {
  code: string;
  details?: string[];

  constructor(code: string, message: string, details?: string[]) {
    super(message);
    this.name = "IngestError";
    this.code = code;
    this.details = details;
  }
}

const CORE_KEYS = new Set([
  "orderId",
  "transactionType",
  "createdAt",
  "paidAt",
  "currency",
  "payout",
  "incomeTotal",
  "feeTotal",
]);

function isEmptyValue(value: Primitive | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

const FORMULA_ERROR_TOKENS = new Set([
  "#REF!",
  "#DIV/0!",
  "#VALUE!",
  "#NAME?",
  "#N/A",
  "#NUM!",
  "#NULL!",
  "#ERROR!",
]);

export function isFormulaErrorValue(value: Primitive | undefined): boolean {
  if (typeof value !== "string") return false;
  const upper = value.trim().toUpperCase();
  return FORMULA_ERROR_TOKENS.has(upper) || /^#[A-Z0-9/!?]+$/.test(upper);
}

function cellToPrimitive(value: CellValue): Primitive {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    if ("error" in value) {
      const errCode = (value as { error?: unknown }).error;
      return typeof errCode === "string" && errCode.trim() ? errCode.trim() : "#ERROR!";
    }
    if ("richText" in value) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("formula" in value || "sharedFormula" in value) {
      const result = (value as { result?: CellValue }).result;
      return result === undefined ? null : cellToPrimitive(result);
    }
    if ("text" in value) {
      const text = (value as { text?: unknown }).text;
      return typeof text === "string" ? text : null;
    }
  }
  return String(value);
}

function readSheetRows(sheet: ExcelJS.Worksheet): Primitive[][] {
  const rows: Primitive[][] = [];
  const rowCount = sheet.rowCount;
  for (let index = 1; index <= rowCount; index++) {
    const values = sheet.getRow(index).values;
    const row = Array.isArray(values) ? values.slice(1).map(cellToPrimitive) : [];
    rows.push(row);
  }
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.every((value) => isEmptyValue(value))) rows.pop();
    else break;
  }
  return rows;
}

export function decodeCsvBuffer(buffer: Buffer): string {
  let text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) {
    let thaiByteCount = 0;
    for (let i = 0; i < buffer.length; i++) {
      const b = buffer[i];
      if ((b >= 0xa1 && b <= 0xda) || (b >= 0xdf && b <= 0xfb)) {
        thaiByteCount++;
      }
    }
    if (thaiByteCount > 0) {
      try {
        text = new TextDecoder("windows-874").decode(buffer);
      } catch {
        const chars: string[] = [];
        for (let i = 0; i < buffer.length; i++) {
          const b = buffer[i];
          if ((b >= 0xa1 && b <= 0xda) || (b >= 0xdf && b <= 0xfb)) {
            chars.push(String.fromCharCode(b + 0x0d60));
          } else {
            chars.push(String.fromCharCode(b));
          }
        }
        text = chars.join("");
      }
    }
  }
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}

export function parseCsvToRows(buffer: Buffer): Primitive[][] {
  const text = decodeCsvBuffer(buffer);
  // Auto-detect CSV delimiter (comma vs semicolon) from the first non-empty line
  const firstLineEnd = text.search(/\r|\n/);
  const firstLine = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semiCount > commaCount ? ";" : ",";

  const rows: Primitive[][] = [];
  let currentRow: Primitive[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += ch;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (!last || last.every((value) => isEmptyValue(value))) rows.pop();
    else break;
  }
  return rows;
}

export function isZipBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

export async function readInputSheets(
  input: Buffer | ArrayBuffer,
): Promise<{ name: string; rows: Primitive[][] }[]> {
  const buffer = input instanceof ArrayBuffer ? Buffer.from(input) : input;
  if (isZipBuffer(buffer)) {
    const sheets: { name: string; rows: Primitive[][] }[] = [];
    try {
      const stream = Readable.from(buffer);
      const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(
        stream as never,
        {
          entries: "emit",
          sharedStrings: "cache",
          hyperlinks: "ignore",
          styles: "ignore",
          worksheets: "emit",
        },
      );
      for await (const worksheetReader of workbookReader) {
        const rows: Primitive[][] = [];
        for await (const row of worksheetReader) {
          const values = row.values;
          const mapped = Array.isArray(values)
            ? values.slice(1).map(cellToPrimitive)
            : [];
          rows.push(mapped);
        }
        while (rows.length > 0) {
          const last = rows[rows.length - 1];
          if (!last || last.every((value) => isEmptyValue(value))) rows.pop();
          else break;
        }
        sheets.push({
          name: String((worksheetReader as { name?: string }).name ?? `Sheet${sheets.length + 1}`),
          rows,
        });
      }
      if (sheets.length > 0) {
        return sheets;
      }
    } catch {
      // Fallback to standard Workbook loader if stream reader encounters non-standard zip structure
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch (error) {
      throw new IngestError(
        "INVALID_FILE",
        "อ่านไฟล์ Excel ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx หรือ .csv ที่ไม่เสียหาย",
        [String(error)],
      );
    }
    return workbook.worksheets.map((sheet) => ({
      name: sheet.name,
      rows: readSheetRows(sheet),
    }));
  }

  const probe = buffer.subarray(0, Math.min(512, buffer.length));
  let nullBytes = 0;
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) nullBytes++;
  }
  if (nullBytes > 0) {
    throw new IngestError(
      "INVALID_FILE",
      "อ่านไฟล์ไม่ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx หรือ .csv ที่ไม่เสียหาย",
    );
  }
  const csvRows = parseCsvToRows(buffer);
  if (csvRows.length === 0) {
    throw new IngestError("INVALID_FILE", "ไฟล์ว่างหรือไม่มีข้อมูลตาราง");
  }
  return [{ name: "CSV", rows: csvRows }];
}

export function toNumber(value: Primitive | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return 0;
  let text = String(value ?? "").trim();
  if (
    !text ||
    text === "-" ||
    text === "--" ||
    text === "/" ||
    text === "N/A" ||
    isFormulaErrorValue(text)
  ) {
    return 0;
  }
  const wrappedInParentheses = /^\(.*\)$/.test(text);
  text = text
    .replace(/[\s\u00A0]/g, "")
    .replace(/(?:บาท|baht|thb)/gi, "")
    .replace(/[฿$]/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\.-\s*$/, "")
    .replace(/-\s*$/, "")
    .replace(/,/g, "")
    .replace(/[()]/g, "")
    .replace(/%$/, "");
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return 0;
  return wrappedInParentheses ? -Math.abs(parsed) : parsed;
}

function normalizeYear(rawYear: number): number {
  if (!Number.isInteger(rawYear)) return rawYear;
  if (rawYear >= 2400 && rawYear <= 2700) {
    return rawYear - 543;
  }
  if (rawYear >= 40 && rawYear <= 99) {
    return 1957 + rawYear; // พ.ศ. 2540..2599 (เช่น 68 -> 2025, 69 -> 2026)
  }
  if (rawYear >= 0 && rawYear < 40) {
    return 2000 + rawYear; // ค.ศ. 2000..2039 (เช่น 25 -> 2025, 26 -> 2026)
  }
  return rawYear;
}

function isoFromParts(rawYear: number, month: number, day: number): string | null {
  if (!Number.isInteger(rawYear) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const year = normalizeYear(rawYear);
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const THAI_MONTH_MAP: ReadonlyArray<[string, number]> = [
  ["มกราคม", 1],
  ["กุมภาพันธ์", 2],
  ["มีนาคม", 3],
  ["เมษายน", 4],
  ["พฤษภาคม", 5],
  ["มิถุนายน", 6],
  ["กรกฎาคม", 7],
  ["สิงหาคม", 8],
  ["กันยายน", 9],
  ["ตุลาคม", 10],
  ["พฤศจิกายน", 11],
  ["ธันวาคม", 12],
  ["ม.ค.", 1],
  ["ก.พ.", 2],
  ["มี.ค.", 3],
  ["เม.ย.", 4],
  ["พ.ค.", 5],
  ["มิ.ย.", 6],
  ["ก.ค.", 7],
  ["ส.ค.", 8],
  ["ก.ย.", 9],
  ["ต.ค.", 10],
  ["พ.ย.", 11],
  ["ธ.ค.", 12],
  ["มค", 1],
  ["กพ", 2],
  ["มีค", 3],
  ["เมย", 4],
  ["พค", 5],
  ["มิย", 6],
  ["กค", 7],
  ["สค", 8],
  ["กย", 9],
  ["ตค", 10],
  ["พย", 11],
  ["ธค", 12],
];

export function detectDateColumnFormat(
  values: (Primitive | undefined)[],
): "DMY" | "MDY" {
  let dmyEvidence = 0;
  let mdyEvidence = 0;
  for (const val of values) {
    if (val === null || val === undefined || typeof val === "number" || val instanceof Date) {
      continue;
    }
    const text = String(val).trim();
    const m = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2}|\d{4})(?:\b|\s|$)/.exec(text);
    if (!m) continue;
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first > 12 && first <= 31 && second >= 1 && second <= 12) {
      dmyEvidence++;
    } else if (second > 12 && second <= 31 && first >= 1 && first <= 12) {
      mdyEvidence++;
    }
  }
  if (mdyEvidence > 0 && dmyEvidence === 0) {
    return "MDY";
  }
  return "DMY";
}

export function parseDateValue(
  value: Primitive | undefined,
  preferFormat?: "DMY" | "MDY",
): {
  iso: string | null;
  ambiguous: boolean;
} {
  if (value === null || value === undefined || value === "") {
    return { iso: null, ambiguous: false };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, ambiguous: false };
    return {
      iso: isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate()),
      ambiguous: false,
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const utc = new Date(Math.round((value - 25569) * 86400000));
      return {
        iso: isoFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate()),
        ambiguous: false,
      };
    }
    return { iso: null, ambiguous: false };
  }
  const text = String(value).trim();
  if (!text) return { iso: null, ambiguous: false };

  const ymd = /^(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})(?:\b|\s|$)/.exec(text);
  if (ymd) {
    return {
      iso: isoFromParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])),
      ambiguous: false,
    };
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact) {
    return {
      iso: isoFromParts(Number(compact[1]), Number(compact[2]), Number(compact[3])),
      ambiguous: false,
    };
  }

  const dmy = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4}|\d{2})(?:\b|\s|$)/.exec(text);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const year = Number(dmy[3]);
    let day = first;
    let month = second;
    let ambiguous = false;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    } else {
      ambiguous = true;
      if (preferFormat === "MDY") {
        month = first;
        day = second;
      } else {
        day = first;
        month = second;
      }
    }
    return { iso: isoFromParts(year, month, day), ambiguous };
  }

  // Thai month format: e.g. "15 ต.ค. 2569", "1 ตุลาคม 69"
  for (const [mName, mNum] of THAI_MONTH_MAP) {
    if (text.includes(mName)) {
      const mThai = new RegExp(
        `^(\\d{1,2})\\s*${mName.replace(/\./g, "\\.?")}\\s*(\\d{4}|\\d{2})(?:\\b|\\s|$)`,
      ).exec(text);
      if (mThai) {
        return {
          iso: isoFromParts(Number(mThai[2]), mNum, Number(mThai[1])),
          ambiguous: false,
        };
      }
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      iso: isoFromParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()),
      ambiguous: false,
    };
  }
  return { iso: null, ambiguous: false };
}

function normalizeId(value: Primitive | undefined): string {
  return String(value ?? "")
    .replace(/^'/, "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function numericField(def: FieldDef, value: Primitive): boolean {
  return def.kind === "money" || def.kind === "feeParent" || def.kind === "feeChild" || def.kind === "infoNumber";
}

function buildFeeGroups(
  fields: Record<string, string | number>,
  mappedFields: Set<string>,
): Record<string, FeeGroupValue> {
  const groups: Record<string, FeeGroupValue> = {};
  for (const group of FEE_GROUPS) {
    const parentMapped = group.fields.some((key) => mappedFields.has(key));
    let total = 0;
    if (parentMapped) {
      for (const key of group.fields) total += toNumber(fields[key]);
    } else {
      for (const key of group.children) total += toNumber(fields[key]);
    }
    const children: Record<string, number> = {};
    for (const key of group.children) {
      if (!mappedFields.has(key)) continue;
      const amount = round2(toNumber(fields[key]));
      if (amount !== 0) children[key] = amount;
    }
    if (total !== 0 || Object.keys(children).length > 0) {
      groups[group.key] = { total: round2(total), children };
    }
  }
  return groups;
}

export function buildChecks(
  fields: Record<string, string | number>,
  groups: Record<string, FeeGroupValue>,
  unknownValues: UnknownValue[] = [],
): TransactionChecks {
  const incomeTotal = toNumber(fields.incomeTotal);
  const feeTotal = toNumber(fields.feeTotal);
  const payout = toNumber(fields.payout);
  const adjustment = toNumber(fields.adjustment);

  const extraIncome = round2(
    unknownValues
      .filter((u) => u.category === "income")
      .reduce((sum, u) => sum + toNumber(u.amount), 0),
  );
  const extraFee = round2(
    unknownValues
      .filter((u) => u.category === "fee")
      .reduce((sum, u) => sum + toNumber(u.amount), 0),
  );
  const extraAdjustment = round2(
    unknownValues
      .filter((u) => u.category === "adjustment")
      .reduce((sum, u) => sum + toNumber(u.amount), 0),
  );

  const baseIncomeParts =
    toNumber(fields.productAfterDiscount) + toNumber(fields.refundAfterDiscount);
  const rawIncomeDiff = round2(incomeTotal - baseIncomeParts);
  const diffWithExtraIncome = round2(incomeTotal - (baseIncomeParts + extraIncome));

  let incomeDiff = rawIncomeDiff;
  let topLevelExtraIncome = 0;
  if (extraIncome !== 0) {
    if (Math.abs(diffWithExtraIncome) < Math.abs(rawIncomeDiff)) {
      incomeDiff = diffWithExtraIncome;
    } else {
      topLevelExtraIncome = extraIncome;
    }
  }

  const feeGroupSum = Object.values(groups).reduce((sum, group) => sum + group.total, 0);
  const rawFeeDiff = round2(feeTotal - feeGroupSum);
  const diffWithExtraFee = round2(feeTotal - (feeGroupSum + extraFee));

  let feeDiff = rawFeeDiff;
  let topLevelExtraFee = 0;
  if (extraFee !== 0) {
    if (Math.abs(diffWithExtraFee) < Math.abs(rawFeeDiff)) {
      feeDiff = diffWithExtraFee;
    } else {
      topLevelExtraFee = extraFee;
    }
  }

  const rawPayoutDiff = round2(payout - (incomeTotal + feeTotal + adjustment));
  const topLevelDelta = round2(topLevelExtraIncome + topLevelExtraFee + extraAdjustment);
  const diffWithTopLevel = round2(
    payout - (incomeTotal + feeTotal + adjustment + topLevelDelta),
  );
  const payoutDiff =
    topLevelDelta !== 0 && Math.abs(diffWithTopLevel) <= Math.abs(rawPayoutDiff)
      ? diffWithTopLevel
      : rawPayoutDiff;

  return {
    incomeDiff,
    feeDiff,
    payoutDiff,
  };
}

function finalizeTransaction(
  transaction: Omit<NormalizedTransaction, "feeGroups" | "checks">,
): NormalizedTransaction {
  const mapped = new Set(transaction.mappedFields);
  const feeGroups = buildFeeGroups(transaction.fields, mapped);
  return {
    ...transaction,
    feeGroups,
    checks: buildChecks(transaction.fields, feeGroups, transaction.unknownValues),
  };
}

export function recalculateTransactionWithRules(
  transaction: NormalizedTransaction,
  unknownColumnCategories?: Record<string, UnknownColumnCategory>,
): NormalizedTransaction {
  const updatedUnknowns: UnknownValue[] = (transaction.unknownValues ?? []).map((u) => {
    const category = lookupUnknownColumnCategory(u.header, unknownColumnCategories);
    return {
      ...u,
      ...(category ? { category } : { category: undefined }),
    };
  });
  return finalizeTransaction({
    ...transaction,
    unknownValues: updatedUnknowns,
  });
}

function rawValue(value: Primitive): string | number {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const text = String(value ?? "").trim();
  return text.length > 800 ? `${text.slice(0, 800)}…` : text;
}

function isLikelyHeaderRow(
  mapping: MappingEntry[],
  hasCustomMapping = false,
): {
  valid: boolean;
  score: number;
  uniqueKeys: number;
  coreHits: number;
} {
  const keys = new Set(mapping.filter((entry) => entry.fieldKey).map((entry) => entry.fieldKey as string));
  const coreHits = [...keys].filter((key) => CORE_KEYS.has(key)).length;
  const hasOrderId = keys.has("orderId");
  const hasMoney = keys.has("payout") || keys.has("incomeTotal") || keys.has("feeTotal");
  const minKeys = hasCustomMapping ? 2 : 5;
  const minCore = hasCustomMapping ? 1 : 2;
  const valid = hasOrderId && hasMoney && keys.size >= minKeys && coreHits >= minCore;
  return {
    valid,
    score: keys.size + coreHits * 6 + (hasOrderId ? 10 : 0) + (hasMoney ? 6 : 0),
    uniqueKeys: keys.size,
    coreHits,
  };
}

function confidenceRank(c: MappingEntry["confidence"]): number {
  if (c === "exact") return 3;
  if (c === "canonical") return 2;
  if (c === "fuzzy") return 1;
  return 0;
}

function mapRow(
  row: Primitive[],
  columnCount: number,
  customMapping?: Record<string, string>,
): MappingEntry[] {
  const exactBuiltInFields = new Set<string>();
  for (let col = 0; col < columnCount; col++) {
    const header = String(row[col] ?? "").trim();
    if (!header) continue;
    const std = matchHeader(header);
    if (std?.confidence === "exact") {
      exactBuiltInFields.add(std.fieldKey);
    }
  }

  const entries: MappingEntry[] = [];
  for (let col = 0; col < columnCount; col++) {
    const header = String(row[col] ?? "").trim();
    const stdMatch = header ? matchHeader(header) : null;
    const customFieldKey = header ? lookupCustomFieldKey(header, customMapping) : null;
    const customDef = customFieldKey ? FIELD_BY_KEY.get(customFieldKey) : undefined;
    const ignoreStaleCustom =
      Boolean(
        customDef &&
          stdMatch?.confidence === "exact" &&
          stdMatch.fieldKey !== customDef.key &&
          exactBuiltInFields.has(customDef.key),
      );
    const match =
      customDef && !ignoreStaleCustom
        ? { fieldKey: customDef.key, confidence: "exact" as const }
        : stdMatch;
    entries.push({
      col,
      header,
      fieldKey: match?.fieldKey ?? null,
      label: match ? FIELD_BY_KEY.get(match.fieldKey)?.label ?? null : null,
      kind: match ? FIELD_BY_KEY.get(match.fieldKey)?.kind ?? null : null,
      confidence: match?.confidence ?? "unmapped",
      nonEmpty: 0,
    });
  }
  return entries;
}

interface SheetCandidate {
  sheetName: string;
  rows: Primitive[][];
  headerRow: number;
  mapping: MappingEntry[];
  score: number;
  nameHint: number;
}

function sheetNameHint(name: string): number {
  const normalized = normalizeHeader(name);
  if (
    normalized.includes("รายละเอียดคำสั่งซื้อ") ||
    normalized.includes("order detail") ||
    normalized.includes("income detail")
  ) {
    return 30;
  }
  if (normalized.includes("รายได้") || normalized.includes("income")) return 10;
  return 0;
}

function findDetailSheet(
  sheets: { name: string; rows: Primitive[][] }[],
  customMapping?: Record<string, string>,
): SheetCandidate {
  const candidates: SheetCandidate[] = [];
  const rejected: string[] = [];
  const hasCustomMapping = Boolean(customMapping && Object.keys(customMapping).length > 0);

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (rows.length < 2) continue;
    const limit = Math.min(30, rows.length);
    let best: SheetCandidate | null = null;
    for (let index = 0; index < limit; index++) {
      const columnCount = Math.max(rows[index]?.length ?? 0, rows[index + 1]?.length ?? 0);
      if (columnCount === 0) continue;
      const mapping = mapRow(rows[index], columnCount, customMapping);
      const info = isLikelyHeaderRow(mapping, hasCustomMapping);
      if (!info.valid) continue;
      const candidate: SheetCandidate = {
        sheetName: sheet.name,
        rows,
        headerRow: index,
        mapping,
        score: info.score + sheetNameHint(sheet.name),
        nameHint: sheetNameHint(sheet.name),
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (best) {
      const idColumn = best.mapping.find((entry) => entry.fieldKey === "orderId")?.col ?? -1;
      if (idColumn >= 0) {
        const dataRows = best.rows
          .slice(best.headerRow + 1)
          .filter((row) => normalizeId(row[idColumn]) !== "");
        if (dataRows.length > 0) {
          best.score += Math.min(20, dataRows.length / 100);
          candidates.push(best);
        } else {
          rejected.push(`${sheet.name}: พบหัวตารางแต่ไม่มีข้อมูล`);
        }
      }
    } else {
      rejected.push(`${sheet.name}: ไม่พบหัวตารางที่รู้จัก`);
    }
  }

  if (candidates.length === 0) {
    throw new IngestError(
      "HEADER_NOT_FOUND",
      "ไม่พบชีตที่มีหัวตารางรายได้ TikTok Shop (ต้องมีหมายเลขคำสั่งซื้อและยอดชำระเงิน)",
      rejected,
    );
  }

  candidates.sort((a, b) => {
    if (b.nameHint !== a.nameHint) return b.nameHint - a.nameHint;
    return b.score - a.score;
  });
  return candidates[0];
}

const REPORT_LABEL_HINTS = new Set(
  [
    "ช่วงเวลา",
    "เขตเวลา",
    "สกุลเงิน",
    "ยอดการชำระเงินทั้งหมด",
    "รายได้ทั้งหมด",
    "ค่าธรรมเนียมทั้งหมด",
    "ยอดรวมค่าสินค้าหลังหักส่วนลดจากผู้ขาย",
    "ยอดรวมค่าสินค้าก่อนหักส่วนลด",
    "ส่วนลดจากร้านค้า",
    "ยอดรวมเงินคืนหลังหักส่วนลดจากผู้ขาย",
    "ยอดรวมเงินคืนก่อนหักส่วนลดจากร้านค้า",
    "เงินคืนจากส่วนลดร้านค้า",
    "การปรับยอด",
    "การปรับค่าจัดส่ง",
    "การชดเชยค่าจัดส่ง",
    "การปฏิเสธการชำระเงิน",
    "ค่าชดเชยแก่ลูกค้า",
    "การปรับโปรโมชั่น",
    "ค่าชดเชยจากแพลตฟอร์ม",
    "ค่าปรับจากแพลตฟอร์ม",
    "ค่าจัดส่งตัวอย่างสินค้า",
    "เงินชดเชยด้านโลจิสติกส์",
    "ค่าชดเชยความพึงพอใจ",
    "ข้อผิดพลาดจากทางร้านค้า",
    "การคืนเงินค่าจัดส่ง",
    "ค่าบริการคลังสินค้า",
    "การปรับค่าคอมมิชชั่นแพลตฟอร์ม",
    "ค่าชดเชยค่าคอมมิชชั่นแพลตฟอร์ม",
    "การปรับค่าธรรมเนียมคำสั่งซื้อ",
    "การชำระเงินด้วย GMV สำหรับการโปรโมท",
    "การชำระเงินด้วย GMV สำหรับโฆษณา TikTok",
    "อากรแสตมป์",
    "การปรับอื่น ๆ",
  ].map((label) => normalizeHeader(label)),
);

function reportValueForRow(row: Primitive[]): { label: string; rawLabel: string; value: Primitive } | null {
  let labelIndex = -1;
  let rawLabel = "";
  for (let index = 0; index < row.length; index++) {
    const text = typeof row[index] === "string" ? String(row[index]).trim() : "";
    if (!text) continue;
    if (REPORT_LABEL_HINTS.has(normalizeHeader(text))) {
      labelIndex = index;
      rawLabel = text;
      break;
    }
  }
  if (labelIndex === -1) {
    for (let index = 0; index < row.length; index++) {
      const text = typeof row[index] === "string" ? String(row[index]).trim() : "";
      if (!text || /^[\d.,%()\s-]+$/.test(text)) continue;
      if (text.length > 80) continue;
      labelIndex = index;
      rawLabel = text;
      break;
    }
  }
  if (labelIndex === -1 || !rawLabel) return null;
  for (let index = row.length - 1; index > labelIndex; index--) {
    if (!isEmptyValue(row[index])) {
      return { label: normalizeHeader(rawLabel), rawLabel, value: row[index] };
    }
  }
  return null;
}

function parsePeriod(
  value: Primitive,
): { start: string | null; end: string | null } {
  const text = String(value ?? "").trim();
  const parts = text.split(/\s*(?:-|–|—|~|ถึง)\s*/).filter(Boolean);
  if (parts.length >= 2) {
    const start = parseDateValue(parts[0]).iso;
    const end = parseDateValue(parts[1]).iso;
    if (start && end) return { start, end };
  }
  const single = parseDateValue(text).iso;
  return { start: single, end: single };
}

function parseReportSheet(
  sheetName: string,
  rows: Primitive[][],
): { summary: ReportSummary; score: number } {
  const totals: Record<string, number> = {};
  const raw: { label: string; value: string }[] = [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let timezone: string | null = null;
  let currency: string | null = null;
  let score = 0;

  for (const row of rows) {
    const firstCol = normalizeHeader(String(row[0] ?? ""));
    if (
      firstCol === normalizeHeader("ประเภทธุรกรรม") ||
      firstCol === normalizeHeader("คำอธิบายค่าธรรมเนียม") ||
      firstCol === normalizeHeader("ชื่อ")
    ) {
      break;
    }
    const entry = reportValueForRow(row);
    if (!entry) continue;
    const valueText =
      entry.value instanceof Date
        ? `${entry.value.getFullYear()}-${String(entry.value.getMonth() + 1).padStart(2, "0")}-${String(
            entry.value.getDate(),
          ).padStart(2, "0")}`
        : String(entry.value ?? "").trim();
    if (!valueText) continue;
    if (raw.length < 250) raw.push({ label: entry.rawLabel, value: valueText });

    if (entry.label === normalizeHeader("ช่วงเวลา")) {
      const period = parsePeriod(entry.value);
      periodStart = period.start;
      periodEnd = period.end;
      score += 2;
      continue;
    }
    if (entry.label === normalizeHeader("เขตเวลา")) {
      timezone = valueText;
      score += 1;
      continue;
    }
    if (entry.label === normalizeHeader("สกุลเงิน")) {
      currency = valueText;
      score += 1;
      continue;
    }

    const numeric = toNumber(entry.value);
    const isNumeric =
      typeof entry.value === "number" ||
      (typeof entry.value === "string" && /^[\s(]*-?[\d,]+(?:\.\d+)?[\s)]*$/.test(entry.value));
    if (isNumeric) {
      totals[entry.label] = round2(numeric);
      score += 2;
    }
  }

  return {
    score,
    summary: {
      found: score >= 2,
      sheetName,
      periodStart,
      periodEnd,
      timezone,
      currency,
      totals,
      raw,
    },
  };
}

function findReport(
  sheets: { name: string; rows: Primitive[][] }[],
  detailSheetName: string,
  embeddedRows?: Primitive[][],
): ReportSummary {
  let best: { summary: ReportSummary; score: number } | null = null;
  for (const sheet of sheets) {
    if (sheet.name === detailSheetName) continue;
    const parsed = parseReportSheet(sheet.name, sheet.rows);
    if (!best || parsed.score > best.score) best = parsed;
  }
  if (embeddedRows && embeddedRows.length > 0) {
    const parsedEmbedded = parseReportSheet(`${detailSheetName} (สรุปท้ายตาราง)`, embeddedRows);
    if (!best || parsedEmbedded.score > best.score) {
      best = parsedEmbedded;
    }
  }
  if (best && best.summary.found) return best.summary;
  return {
    found: false,
    sheetName: null,
    periodStart: null,
    periodEnd: null,
    timezone: null,
    currency: null,
    totals: {},
    raw: [],
  };
}

function combineTransactions(
  transactions: NormalizedTransaction[],
): NormalizedTransaction[] {
  const result: NormalizedTransaction[] = [];
  const orderMap = new Map<string, NormalizedTransaction>();

  for (const transaction of transactions) {
    if (!transaction.isOrder) {
      result.push(transaction);
      continue;
    }
    const existing = orderMap.get(transaction.externalId);
    if (!existing) {
      orderMap.set(transaction.externalId, transaction);
      continue;
    }

    const mergedFields: Record<string, string | number> = { ...existing.fields };
    const keys = new Set([...Object.keys(existing.fields), ...Object.keys(transaction.fields)]);
    for (const key of keys) {
      const def = FIELD_BY_KEY.get(key);
      if (!def) continue;
      const a = existing.fields[key];
      const b = transaction.fields[key];
      if (def.agg === "sum") {
        mergedFields[key] = round2(toNumber(a) + toNumber(b));
      } else if (def.agg === "max") {
        mergedFields[key] = Math.max(toNumber(a), toNumber(b));
      } else if (def.agg === "concat") {
        const parts = [String(a ?? ""), String(b ?? "")]
          .flatMap((text) => text.split(";"))
          .map((text) => text.trim())
          .filter((text) => text && text !== "/");
        mergedFields[key] = [...new Set(parts)].join("; ").slice(0, 2000);
      } else if (def.kind === "date") {
        if (key === "createdAt") {
          mergedFields[key] = String(a || b || "").localeCompare(String(b || a || "")) <= 0 ? String(a || b || "") : String(b || a || "");
        } else {
          mergedFields[key] = String(a || b || "").localeCompare(String(b || a || "")) >= 0 ? String(a || b || "") : String(b || a || "");
        }
      } else if (isEmptyValue(a as Primitive) && !isEmptyValue(b as Primitive)) {
        mergedFields[key] = b;
      }
    }

    const mergedUnknown = new Map<string, UnknownValue>();
    for (const value of [...existing.unknownValues, ...transaction.unknownValues]) {
      const key = `${value.header}|${value.moneyLike}`;
      const previous = mergedUnknown.get(key);
      mergedUnknown.set(key, {
        ...value,
        amount: round2((previous?.amount ?? 0) + value.amount),
      });
    }

    const merged = finalizeTransaction({
      externalId: existing.externalId,
      transactionType: existing.transactionType || transaction.transactionType,
      isOrder: true,
      createdAt: String(mergedFields.createdAt ?? ""),
      paidAt: String(mergedFields.paidAt ?? existing.paidAt ?? transaction.paidAt),
      currency: String(mergedFields.currency ?? existing.currency),
      fields: mergedFields,
      mappedFields: [...new Set([...existing.mappedFields, ...transaction.mappedFields])],
      unknownValues: [...mergedUnknown.values()],
      warnings: [
        ...existing.warnings,
        ...transaction.warnings,
        {
          code: "DUPLICATE_ORDER_ROWS",
          message: `พบ ${existing.sourceRows + transaction.sourceRows} แถวของคำสั่งซื้อเดียวกัน – รวมยอดให้แล้ว`,
          severity: "warning",
        },
      ],
      raw: existing.raw,
      sourceRows: existing.sourceRows + transaction.sourceRows,
      firstRow: existing.firstRow,
      rowIndexes: [...existing.rowIndexes, ...transaction.rowIndexes],
    });
    orderMap.set(transaction.externalId, merged);
  }

  return [...result, ...orderMap.values()];
}

export async function parseWorkbook(
  input: Buffer | ArrayBuffer,
  options?: ParseWorkbookOptions,
): Promise<ParsedWorkbook> {
  const sheets = options?.preloadedSheets ?? (await readInputSheets(input));
  const detail = findDetailSheet(sheets, options?.customMapping);
  const headers = detail.mapping.map((entry) => entry.header);
  const columnCount = headers.length;

  let detailEndRow = detail.rows.length;
  for (let index = detail.headerRow + 1; index < detail.rows.length; index++) {
    const row = detail.rows[index] ?? [];
    const col0 = normalizeHeader(String(row[0] ?? ""));
    const col1 = normalizeHeader(String(row[1] ?? ""));
    if (
      (!col0 && REPORT_LABEL_HINTS.has(col1)) ||
      col0 === normalizeHeader("ประเภทธุรกรรม") ||
      col0 === normalizeHeader("คำอธิบายค่าธรรมเนียม")
    ) {
      detailEndRow = index;
      break;
    }
  }
  const embeddedReportRows =
    detailEndRow < detail.rows.length ? detail.rows.slice(detailEndRow) : undefined;

  const mappingByField = new Map<string, MappingEntry>();
  const duplicateHeaders: string[] = [];
  for (const entry of detail.mapping) {
    if (!entry.fieldKey) continue;
    const existing = mappingByField.get(entry.fieldKey);
    if (existing) {
      const existingRank = confidenceRank(existing.confidence);
      const entryRank = confidenceRank(entry.confidence);
      if (entryRank > existingRank) {
        existing.fieldKey = null;
        existing.label = null;
        existing.kind = null;
        existing.confidence = "unmapped";
        mappingByField.set(entry.fieldKey, entry);
      } else if (entryRank < existingRank) {
        entry.fieldKey = null;
        entry.label = null;
        entry.kind = null;
        entry.confidence = "unmapped";
      } else {
        duplicateHeaders.push(`${entry.header || `คอลัมน์ ${entry.col + 1}`} ซ้ำกับ ${existing.header}`);
      }
    } else {
      mappingByField.set(entry.fieldKey, entry);
    }
  }

  const fieldColumns = new Map<string, number>();
  for (const [key, entry] of mappingByField) fieldColumns.set(key, entry.col);

  const dateColumnFormats = new Map<number, "DMY" | "MDY">();
  for (const [key, col] of fieldColumns) {
    const def = FIELD_BY_KEY.get(key);
    if (def?.kind === "date") {
      const colVals: Primitive[] = [];
      for (let index = detail.headerRow + 1; index < detailEndRow; index++) {
        colVals.push(detail.rows[index]?.[col] ?? null);
      }
      dateColumnFormats.set(col, detectDateColumnFormat(colVals));
    }
  }

  for (const entry of detail.mapping) {
    if (!entry.fieldKey) continue;
    let count = 0;
    for (let index = detail.headerRow + 1; index < detailEndRow; index++) {
      if (!isEmptyValue(detail.rows[index][entry.col])) count++;
    }
    entry.nonEmpty = count;
  }

  const unknownColumns: UnknownColumn[] = [];
  for (const entry of detail.mapping) {
    if (entry.fieldKey || !entry.header) continue;
    let nonEmpty = 0;
    let nonZeroNumeric = 0;
    const samples: string[] = [];
    for (let index = detail.headerRow + 1; index < detailEndRow; index++) {
      const value = detail.rows[index][entry.col];
      if (isEmptyValue(value)) continue;
      nonEmpty++;
      const numeric = toNumber(value);
      if (numeric !== 0) {
        nonZeroNumeric++;
        if (samples.length < 3) samples.push(`${rawValue(value)}`);
      }
    }
    const category = lookupUnknownColumnCategory(
      entry.header,
      options?.unknownColumnCategories,
    );
    unknownColumns.push({
      col: entry.col,
      header: entry.header,
      nonEmpty,
      nonZeroNumeric,
      moneyLike: isMoneyLikeHeader(entry.header),
      samples,
      ...(category ? { category } : {}),
    });
  }

  const rawKeys: string[] = [];
  const rawSeen = new Map<string, number>();
  for (let col = 0; col < columnCount; col++) {
    const header = headers[col] || `คอลัมน์ ${col + 1}`;
    const count = (rawSeen.get(header) ?? 0) + 1;
    rawSeen.set(header, count);
    rawKeys.push(count > 1 ? `${header} #${count}` : header);
  }

  const transactions: NormalizedTransaction[] = [];
  const rowWarnings: IngestWarning[] = [];
  let ambiguousDates = 0;

  for (let index = detail.headerRow + 1; index < detailEndRow; index++) {
    const row = detail.rows[index] ?? [];
    const excelRow = index + 1;
    if (row.every((value) => isEmptyValue(value))) continue;

    const fields: Record<string, string | number> = {};
    const rowNotes: IngestWarning[] = [];

    for (const [key, col] of fieldColumns) {
      const def = FIELD_BY_KEY.get(key);
      if (!def) continue;
      const value = row[col];
      if (isEmptyValue(value)) continue;

      if (def.kind === "date") {
        const parsed = parseDateValue(value, dateColumnFormats.get(col));
        if (!parsed.iso) {
          rowNotes.push({
            code: "INVALID_DATE",
            message: `อ่านวันที่ของ ${def.label} ไม่ได้: "${rawValue(value)}"`,
            severity: "warning",
            row: excelRow,
          });
          continue;
        }
        if (parsed.ambiguous) ambiguousDates++;
        fields[key] = parsed.iso;
        continue;
      }

      if (numericField(def, value)) {
        const trimmedVal = typeof value === "string" ? value.trim() : "";
        const isFormulaErr = isFormulaErrorValue(value);
        const invalid =
          typeof value === "string" &&
          (isFormulaErr ||
            (!/^[\s(฿$]*[−–—-]?[\d,]+(?:\.\d+)?(?:\.-|-\s*)?[\s)฿$]*(?:บาท|baht|thb|%)?$/i.test(
              trimmedVal,
            ) &&
              !["-", "--", "/", "N/A"].includes(trimmedVal)));
        if (invalid) {
          rowNotes.push({
            code: isFormulaErr ? "FORMULA_ERROR" : "INVALID_NUMBER",
            message: isFormulaErr
              ? `พบข้อผิดพลาดสูตร Excel ใน ${def.label}: "${rawValue(value)}"`
              : `อ่านตัวเลขของ ${def.label} ไม่ได้: "${rawValue(value)}"`,
            severity: "warning",
            row: excelRow,
          });
          continue;
        }
        fields[key] = round2(toNumber(value));
        continue;
      }

      if (def.kind === "id") {
        fields[key] = normalizeId(value);
      } else {
        const text = String(value).trim();
        const limited = def.key === "productDetail" ? text.slice(0, 2000) : text.slice(0, 500);
        if (limited) fields[key] = limited;
      }
    }

    const rawOrderId = normalizeId(fields.orderId as Primitive);
    const externalId =
      rawOrderId || normalizeId(fields.relatedOrderId as Primitive);
    if (!externalId) {
      const hasMoney = [...fieldColumns.keys()].some(
        (key) => numericField(FIELD_BY_KEY.get(key)!, row[fieldColumns.get(key)!] ?? null) &&
          toNumber(row[fieldColumns.get(key)!]) !== 0,
      );
      if (hasMoney) {
        rowWarnings.push({
          code: "MISSING_ORDER_ID",
          message: `แถวที่ ${excelRow} ไม่มีหมายเลขคำสั่งซื้อ – ข้ามแถวนี้`,
          severity: "warning",
          row: excelRow,
        });
      }
      continue;
    }

    const transactionType = String(fields.transactionType ?? "").trim() || "ไม่ระบุ";
    const isOrder = isOrderType(transactionType);
    const createdDate = parseDateValue(fields.createdAt as Primitive).iso ?? "";
    const paidDate = parseDateValue(fields.paidAt as Primitive).iso ?? createdDate;

    if (!paidDate) {
      rowNotes.push({
        code: "MISSING_PAID_DATE",
        message: "ไม่พบวันที่ชำระเงิน – รายการนี้จะไม่ถูกจัดเข้ารอบรายวัน",
        severity: "warning",
        row: excelRow,
      });
    } else if (!parseDateValue(fields.paidAt as Primitive).iso) {
      rowNotes.push({
        code: "PAID_DATE_FALLBACK",
        message: "ไม่พบวันที่ชำระเงิน – ใช้วันที่สร้างคำสั่งซื้อแทน",
        severity: "warning",
        row: excelRow,
      });
    }

    if (!isOrder) {
      rowNotes.push({
        code: "NON_ORDER_TRANSACTION",
        message: `ประเภทธุรกรรม "${transactionType}" ไม่ใช่คำสั่งซื้อ – จะแสดงในสรุปรอบ แต่ไม่สร้างบิล`,
        severity: "info",
        row: excelRow,
      });
    }

    const mappedFields = [...fieldColumns.keys()];
    const mappedSet = new Set(mappedFields);

    const unknownValues: UnknownValue[] = [];
    for (const unknown of unknownColumns) {
      const value = row[unknown.col];
      if (isEmptyValue(value)) continue;
      const amount = toNumber(value);
      if (amount === 0) continue;
      unknownValues.push({
        header: unknown.header,
        amount: round2(amount),
        moneyLike: unknown.moneyLike,
        ...(unknown.category ? { category: unknown.category } : {}),
      });
    }

    const raw: Record<string, string | number> = {};
    for (let col = 0; col < columnCount; col++) {
      const value = row[col];
      if (isEmptyValue(value)) continue;
      raw[rawKeys[col]] = rawValue(value);
    }

    const transaction = finalizeTransaction({
      externalId,
      transactionType,
      isOrder,
      createdAt: createdDate,
      paidAt: paidDate,
      currency: String(fields.currency ?? "").trim() || "THB",
      fields,
      mappedFields: [...mappedSet],
      unknownValues,
      warnings: rowNotes,
      raw,
      sourceRows: 1,
      firstRow: excelRow,
      rowIndexes: [excelRow],
    });
    transactions.push(transaction);
  }

  if (transactions.length === 0) {
    throw new IngestError(
      "NO_DATA_ROWS",
      `พบหัวตารางที่ชีต "${detail.sheetName}" แต่ไม่พบแถวข้อมูลที่ใช้ได้`,
    );
  }

  const combined = combineTransactions(transactions);
  const report = findReport(sheets, detail.sheetName, embeddedReportRows);

  const warnings: IngestWarning[] = [];
  if (duplicateHeaders.length > 0) {
    warnings.push({
      code: "DUPLICATE_COLUMNS",
      message: `พบหัวคอลัมน์ซ้ำ: ${duplicateHeaders.join(", ")}`,
      severity: "warning",
    });
  }
  const unclassifiedUnknownColumns = unknownColumns.filter((column) => !column.category);
  if (unclassifiedUnknownColumns.length > 0) {
    warnings.push({
      code: "UNKNOWN_COLUMNS",
      message: `พบ ${unclassifiedUnknownColumns.length} คอลัมน์ที่ระบบยังไม่รู้จัก: ${unclassifiedUnknownColumns
        .map((column) => column.header)
        .join(", ")}`,
      severity: "warning",
    });
  }
  if (ambiguousDates > 0) {
    warnings.push({
      code: "AMBIGUOUS_DATES",
      message: `พบวันที่รูปแบบ ว/ด/ป ที่ตีความได้สองแบบ ${ambiguousDates} แถว – ระบบใช้แบบวันที่/เดือน/ปี`,
      severity: "warning",
    });
  }
  if (!report.found) {
    warnings.push({
      code: "REPORT_SHEET_MISSING",
      message: "ไม่พบชีตสรุป (รายงาน) – ระบบคำนวณยอดจากชีตรายละเอียดแทน",
      severity: "info",
    });
  }
  const duplicateOrderTxs = combined.filter((transaction) =>
    transaction.warnings.some((warning) => warning.code === "DUPLICATE_ORDER_ROWS"),
  );
  if (duplicateOrderTxs.length > 0) {
    const sampleDetails = duplicateOrderTxs
      .slice(0, 10)
      .map((tx) => {
        const rowsText =
          tx.rowIndexes && tx.rowIndexes.length > 0
            ? `แถว ${tx.rowIndexes.join(", ")}`
            : `${tx.sourceRows} แถว`;
        return `#${tx.externalId} (${rowsText})`;
      })
      .join(" · ");
    const moreText =
      duplicateOrderTxs.length > 10
        ? ` และอีก ${duplicateOrderTxs.length - 10} รายการ`
        : "";
    warnings.push({
      code: "DUPLICATE_ORDER_ROWS",
      message: `พบคำสั่งซื้อที่ปรากฏหลายแถว ${duplicateOrderTxs.length} รายการ (${sampleDetails}${moreText}) – รวมยอดเป็นบิลเดียวแล้ว`,
      severity: "warning",
    });
  }

  const warningCounts = new Map<string, { warning: IngestWarning; count: number }>();
  for (const transaction of combined) {
    for (const warning of transaction.warnings) {
      if (warning.code === "DUPLICATE_ORDER_ROWS") continue;
      if (warning.severity === "info") continue;
      const key = `${warning.code}|${warning.message}`;
      const existing = warningCounts.get(key);
      if (existing) existing.count++;
      else warningCounts.set(key, { warning, count: 1 });
    }
  }
  for (const { warning, count } of warningCounts.values()) {
    if (count > 1) {
      warnings.push({
        code: warning.code,
        message: `${warning.message} (${count} แถว)`,
        severity: warning.severity,
      });
    } else {
      warnings.push(warning);
    }
  }
  warnings.push(...rowWarnings);

  const headerSignature = createHash("sha1")
    .update(headers.map((header) => normalizeHeader(header)).join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    sheetName: detail.sheetName,
    headerRow: detail.headerRow + 1,
    headers,
    mapping: detail.mapping,
    unknownColumns,
    transactions: combined,
    report,
    warnings,
    headerSignature,
    dataRowCount: transactions.length,
  };
}

export function getReportTotal(report: ReportSummary, label: string): number | null {
  const key = normalizeHeader(label);
  return Object.prototype.hasOwnProperty.call(report.totals, key)
    ? report.totals[key]
    : null;
}
