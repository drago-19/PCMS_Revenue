import { query, queryOne, withTransaction, type Queryable } from "./db";
import { normalizeHeader } from "./ingest/catalog";

export type UnknownColumnCategory = "income" | "fee" | "adjustment" | "ignore";

export interface ColumnMappingRules {
  /**
   * Maps custom Excel column header name -> system fieldKey
   * Keys are stored both as raw trimmed header and normalized header for resilient matching.
   */
  headerToFieldKey: Record<string, string>;
  /**
   * Maps unknown TikTok Settlement column header name -> financial category
   * - "income": หมวดรายได้
   * - "fee": หมวดค่าธรรมเนียม
   * - "adjustment": หมวดรายการปรับปรุง
   * - "ignore": ข้อมูลทั่วไป / ไม่นำมาคำนวณเงิน
   */
  unknownColumnCategories: Record<string, UnknownColumnCategory>;
}

const SETTING_KEY = "column_mapping_rules";

export const DEFAULT_COLUMN_MAPPING_RULES: ColumnMappingRules = {
  headerToFieldKey: {},
  unknownColumnCategories: {},
};

const VALID_CATEGORIES = new Set<UnknownColumnCategory>([
  "income",
  "fee",
  "adjustment",
  "ignore",
]);

function cleanHeaderMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 500);
  for (const [k, v] of entries) {
    const key = String(k ?? "").trim().slice(0, 200);
    const val = String(v ?? "").trim().slice(0, 100);
    if (key && val) {
      result[key] = val;
    }
  }
  return result;
}

function cleanCategoryMap(raw: unknown): Record<string, UnknownColumnCategory> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, UnknownColumnCategory> = {};
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 500);
  for (const [k, v] of entries) {
    const key = String(k ?? "").trim().slice(0, 200);
    const val = String(v ?? "").trim() as UnknownColumnCategory;
    if (key && VALID_CATEGORIES.has(val)) {
      result[key] = val;
    }
  }
  return result;
}

export function sanitizeColumnMappingRules(
  input: Partial<ColumnMappingRules> | null | undefined,
): ColumnMappingRules {
  if (!input || typeof input !== "object") {
    return {
      headerToFieldKey: {},
      unknownColumnCategories: {},
    };
  }
  return {
    headerToFieldKey: cleanHeaderMap(input.headerToFieldKey),
    unknownColumnCategories: cleanCategoryMap(input.unknownColumnCategories),
  };
}

export function lookupCustomFieldKey(
  header: string,
  headerToFieldKey?: Record<string, string>,
): string | null {
  if (!headerToFieldKey) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (headerToFieldKey[trimmed]) return headerToFieldKey[trimmed]!;
  const norm = normalizeHeader(trimmed);
  for (const [savedHeader, fieldKey] of Object.entries(headerToFieldKey)) {
    if (normalizeHeader(savedHeader) === norm) {
      return fieldKey;
    }
  }
  return null;
}

export function lookupUnknownColumnCategory(
  header: string,
  unknownColumnCategories?: Record<string, UnknownColumnCategory>,
): UnknownColumnCategory | undefined {
  if (!unknownColumnCategories) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  if (unknownColumnCategories[trimmed]) return unknownColumnCategories[trimmed];
  const norm = normalizeHeader(trimmed);
  for (const [savedHeader, category] of Object.entries(unknownColumnCategories)) {
    if (normalizeHeader(savedHeader) === norm) {
      return category;
    }
  }
  return undefined;
}

export async function getColumnMappingRules(
  customClient?: Queryable,
): Promise<ColumnMappingRules> {
  try {
    const row = await queryOne<{ value_json: unknown }>(
      "SELECT value_json FROM app_settings WHERE setting_key = $1",
      [SETTING_KEY],
      customClient,
    );
    if (!row || !row.value_json) {
      return {
        headerToFieldKey: {},
        unknownColumnCategories: {},
      };
    }
    const parsed =
      typeof row.value_json === "string"
        ? (JSON.parse(row.value_json) as Partial<ColumnMappingRules>)
        : (row.value_json as Partial<ColumnMappingRules>);
    return sanitizeColumnMappingRules(parsed);
  } catch {
    return {
      headerToFieldKey: {},
      unknownColumnCategories: {},
    };
  }
}

export async function saveColumnMappingRules(
  patch: {
    headerToFieldKey?: Record<string, string>;
    unknownColumnCategories?: Record<string, UnknownColumnCategory | "">;
    replaceAll?: boolean;
  },
  updatedBy: string,
  customClient?: Queryable,
): Promise<ColumnMappingRules> {
  const run = async (client: Queryable) => {
    const currentRow = await queryOne<{ value_json: unknown }>(
      "SELECT value_json FROM app_settings WHERE setting_key = $1 FOR UPDATE",
      [SETTING_KEY],
      client,
    );
    const current = currentRow?.value_json
      ? sanitizeColumnMappingRules(
          typeof currentRow.value_json === "string"
            ? (JSON.parse(currentRow.value_json) as Partial<ColumnMappingRules>)
            : (currentRow.value_json as Partial<ColumnMappingRules>),
        )
      : { headerToFieldKey: {}, unknownColumnCategories: {} };

    const nextHeaders: Record<string, string> = patch.replaceAll
      ? {}
      : { ...current.headerToFieldKey };
    if (patch.headerToFieldKey) {
      for (const [rawKey, rawVal] of Object.entries(patch.headerToFieldKey)) {
        const key = rawKey.trim().slice(0, 200);
        const val = String(rawVal ?? "").trim().slice(0, 100);
        if (!key) continue;
        if (!val) {
          delete nextHeaders[key];
        } else {
          nextHeaders[key] = val;
        }
      }
    }

    const nextCategories: Record<string, UnknownColumnCategory> = patch.replaceAll
      ? {}
      : { ...current.unknownColumnCategories };
    if (patch.unknownColumnCategories) {
      for (const [rawKey, rawVal] of Object.entries(patch.unknownColumnCategories)) {
        const key = rawKey.trim().slice(0, 200);
        const val = String(rawVal ?? "").trim();
        if (!key) continue;
        if (!val) {
          delete nextCategories[key];
        } else if (VALID_CATEGORIES.has(val as UnknownColumnCategory)) {
          nextCategories[key] = val as UnknownColumnCategory;
        }
      }
    }

    const merged = sanitizeColumnMappingRules({
      headerToFieldKey: nextHeaders,
      unknownColumnCategories: nextCategories,
    });

    await query(
      `INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (setting_key) DO UPDATE SET
         value_json = EXCLUDED.value_json,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [SETTING_KEY, JSON.stringify(merged), updatedBy],
      client,
    );

    return merged;
  };

  if (customClient) {
    return run(customClient);
  }
  return withTransaction(run);
}
