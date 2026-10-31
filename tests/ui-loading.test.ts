import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * กันถอยหลังสำหรับงาน "loading ตอนสลับหน้า" (Navigation Loading)
 * - ต้องมีแถบ loading ระดับหน้าเว็บผูกใน layout และผูกกับ router.push ที่ไม่ได้มาจาก <Link>
 * - ต้องมี loading skeleton ของ route ที่ไม่มี query navigation (/, /bills/[orderId], /settings)
 * - route ที่มีการกรอง/แบ่งหน้าในหน้าเดิม (เช่น /bills, /products) ห้ามมี loading.tsx
 *   เพราะ fallback จะแทนที่แถบตัวกรองทั้งแถบ และขัดกฎ Instant Optimistic Feedback ใน AGENTS.md
 */
function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

test("navigation loading: global progress bar is wired to every page change", () => {
  const layoutSource = readSource("src/app/layout.tsx");
  const navigationProgressSource = readSource("src/components/NavigationProgress.tsx");
  const navigationHelperSource = readSource("src/lib/navigation-progress.ts");

  // layout ต้องเรนเดอร์ NavigationProgress ภายใน Suspense (เพราะใช้ useSearchParams)
  assert.match(layoutSource, /<Suspense\b[^>]*>\s*<NavigationProgress\s*\/>/);
  assert.match(
    navigationProgressSource,
    /useSearchParams\(\)/,
    "NavigationProgress must detect completion via useSearchParams",
  );
  assert.match(navigationProgressSource, /usePathname\(\)/);
  assert.match(
    navigationProgressSource,
    /addEventListener\(NAVIGATION_START_EVENT/,
    "programmatic navigations must be able to raise the progress bar",
  );
  assert.match(
    navigationProgressSource,
    /role="status"[\s\S]*?aria-live="polite"/,
    "pending state must be announced to screen readers",
  );
  // ห้ามมีคลาสเฉพาะหน้าใหม่ใน globals.css — keyframes ต้องอยู่ในคอมโพเนนต์
  assert.match(navigationProgressSource, /@keyframes pcms-navigation-progress/);
  const globalsSource = readSource("src/app/globals.css");
  assert.doesNotMatch(globalsSource, /pcms-navigation-progress/);
  assert.equal(
    navigationHelperSource.match(/export function notifyNavigationStart/g)?.length,
    1,
  );

  // router.push ที่ไม่ผ่าน <Link> ต้องแจ้งแถบ loading ด้วย
  for (const relativePath of [
    "src/components/FilterForm.tsx",
    "src/components/PaginationBar.tsx",
    "src/components/DatePickerField.tsx",
  ]) {
    const source = readSource(relativePath);
    assert.match(source, /notifyNavigationStart\(\)/, relativePath);
  }
});

test("navigation loading: sidebar menu shows a per-item pending spinner", () => {
  const sidebarSource = readSource("src/components/Sidebar.tsx");
  assert.match(sidebarSource, /import Link, \{ useLinkStatus \} from "next\/link"/);
  assert.match(sidebarSource, /const \{ pending \} = useLinkStatus\(\)/);
  assert.match(sidebarSource, /<NavItemIcon icon=\{Icon\} \/>/);
  // spinner ต้องทับบนช่องไอคอนเดิม (ขนาด 18px) เพื่อไม่ให้เมนูกระตุกหรือตัดคำ
  assert.match(sidebarSource, /relative inline-flex size-\[18px\] shrink-0/);
  assert.match(sidebarSource, /absolute size-\[18px\]/);
  assert.match(sidebarSource, /data-nav-pending=\{pending \? "true" : undefined\}/);
  assert.doesNotMatch(sidebarSource, /<NavItemPending/);
});

test("navigation loading: route-level skeletons exist only where query navigation is absent", () => {
  const routesWithSkeleton = [
    "src/app/bills/[orderId]/loading.tsx",
    "src/app/settings/loading.tsx",
  ];
  for (const relativePath of routesWithSkeleton) {
    assert.ok(exists(relativePath), `${relativePath} must exist`);
    const source = readSource(relativePath);
    assert.match(source, /PageSkeleton/);
  }

  const routesWithInPageQueryNavigation = [
    // app/loading.tsx ครอบ page ของทุก segment ลูก → ต้องไม่มี ไม่งั้นการกดกรองในหน้า
    // /bills, /products, /history จะถูก skeleton แทนที่ทั้งแถบตัวกรอง
    "src/app/loading.tsx",
    "src/app/bills/loading.tsx",
    "src/app/products/loading.tsx",
    "src/app/history/loading.tsx",
    "src/app/import/loading.tsx",
    "src/app/import/[id]/loading.tsx",
    "src/app/invoices/[orderId]/loading.tsx",
    "src/app/days/[date]/invoices/loading.tsx",
  ];
  for (const relativePath of routesWithInPageQueryNavigation) {
    assert.equal(
      exists(relativePath),
      false,
      `${relativePath} must not exist (fallback would wipe the filter bar)`,
    );
  }
});

test("in-page table skeleton: shows only in the data region so the filter bar stays", () => {
  const navigationProgressSource = readSource("src/components/NavigationProgress.tsx");
  const boundarySource = readSource("src/components/TableLoadingBoundary.tsx");
  const tableSkeletonSource = readSource("src/components/TableSkeleton.tsx");

  // NavigationProgress ต้อง publish สถานะ pending ลง store (เริ่มทันที / จบเมื่อ URL เปลี่ยน)
  assert.match(navigationProgressSource, /setNavigationPending\(true\)/);
  assert.match(navigationProgressSource, /setNavigationPending\(false\)/);

  assert.match(boundarySource, /useNavigationPending\(\)/);
  assert.match(boundarySource, /if \(!pending\) return <>\{children\}<\/>;/);
  assert.match(boundarySource, /return <TableSkeleton /);

  // skeleton ต้องเข้าถึงได้ + ไม่ล้นจอ 360px
  assert.match(tableSkeletonSource, /role="status"/);
  assert.match(tableSkeletonSource, /aria-busy="true"/);
  assert.match(tableSkeletonSource, /className="sr-only"/);
  assert.doesNotMatch(tableSkeletonSource, /w-\[\d{3,}px\]/);
  assert.match(tableSkeletonSource, /min-\[900px\]:flex/);

  // ต้องมี boundary ครอบเฉพาะส่วนข้อมูลของทั้ง 3 หน้า
  for (const relativePath of [
    "src/app/bills/page.tsx",
    "src/app/products/page.tsx",
    "src/app/history/page.tsx",
  ]) {
    const source = readSource(relativePath);
    assert.match(source, /<TableLoadingBoundary\b/, relativePath);
    assert.match(source, /<\/TableLoadingBoundary>/, relativePath);
  }

  // แถบตัวกรอง/ค้นหา/เลือกวันที่ ต้องอยู่ "ก่อน" boundary (จึงไม่ถูก skeleton แทนที่)
  const billsSource = readSource("src/app/bills/page.tsx");
  assert.ok(
    billsSource.indexOf("<BillsSubFilters") <
      billsSource.indexOf("<TableLoadingBoundary"),
    "bills filter bar must render outside the table boundary",
  );
  const productsSource = readSource("src/app/products/page.tsx");
  assert.ok(
    productsSource.indexOf("<FilterForm") <
      productsSource.indexOf("<TableLoadingBoundary"),
    "products filter form must render outside the table boundary",
  );
  const historySource = readSource("src/app/history/page.tsx");
  assert.ok(
    historySource.indexOf("<DatePickerField") <
      historySource.indexOf("<TableLoadingBoundary"),
    "history date filter must render outside the table boundary",
  );

  // ต้องไม่มี data-pending กลับมาทำให้ skeleton ถูกหรี่ opacity / มีแถบซ้ำ
  const billsFilterSource = readSource("src/components/BillsFilterInteractive.tsx");
  assert.doesNotMatch(billsFilterSource, /data-pending=/);
  assert.doesNotMatch(billsSource, /bills-loading-indicator/);
  // การกดแท็บ/ตัวกรองใน BillsFilterInteractive ต้องแจ้ง notifyNavigationStart() เพื่อให้ TableLoadingBoundary แสดง skeleton ทันที
  assert.match(billsFilterSource, /notifyNavigationStart\(\)/);
  // TableSkeleton ต้องเก็บความสูงของโซนตารางก่อนโหลดเพื่อไม่ให้หน้าจอหดกระตุก
  assert.match(tableSkeletonSource, /recordTableRegionHeight/);
  assert.match(navigationProgressSource, /recordTableRegionHeight/);
  // หน้า /bills: เมื่อเลือก Facebook ให้ซ่อนคอลัมน์ค่าธรรมเนียมตามความต้องการของผู้ใช้ (ช่องทาง Facebook ไม่มีค่าธรรมเนียม)
  assert.match(billsSource, /channel !== "Facebook" \? \(\s*<TableHead/);
  assert.match(billsSource, /min-\[768px\]:table-fixed/);
});

test("action buttons: save/delete actions use Button loading (spinner + aria-busy) instead of disabled-only", () => {
  const buttonSource = readSource("src/components/ui/button.tsx");
  assert.match(buttonSource, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(buttonSource, /disabled=\{disabled \|\| loading\}/);
  assert.match(buttonSource, /Loader2Icon className="size-4 animate-spin"/);

  const settingsSource = readSource("src/components/DocumentSettingsClient.tsx");
  assert.match(settingsSource, /<Button\s+type="submit"[\s\S]{0,160}?loading=\{saving\}/);
  assert.match(settingsSource, /กำลังบันทึก\.\.\./);

  const buyerSaveFiles = [
    "src/components/BillPreviewDialog.tsx",
    "src/components/InvoiceInteractiveView.tsx",
  ];
  for (const relativePath of buyerSaveFiles) {
    const source = readSource(relativePath);
    assert.match(source, /loading=\{saveState === "saving"\}/, relativePath);
    // ห้ามเหลือ spinner ที่ใส่เองในปุ่มบันทึก (จะซ้อนกับ spinner ของ Button)
    assert.doesNotMatch(
      source,
      /<Button[\s\S]{0,220}?\{saveState === "saving" \? \(\s*<Loader2Icon/,
      relativePath,
    );
  }

  const unknownColumnsSource = readSource("src/components/UnknownColumnsManager.tsx");
  assert.match(unknownColumnsSource, /const \[pendingKey, setPendingKey\] = useState<string \| null>/);
  // spinner ต้องขึ้นเฉพาะปุ่มที่ถูกกด ไม่ใช่ทุกปุ่มพร้อมกัน
  assert.match(unknownColumnsSource, /loading=\{pendingKey === "save"\}/);
  assert.match(unknownColumnsSource, /loading=\{pendingKey === "add"\}/);
  assert.match(unknownColumnsSource, /loading=\{pendingKey === `header:\$\{header\}`\}/);
  assert.match(unknownColumnsSource, /loading=\{pendingKey === `category:\$\{header\}`\}/);
  assert.doesNotMatch(unknownColumnsSource, /^\s*loading=\{busy\}/m);
});

test("navigation loading: page skeleton is accessible, uses shadcn Skeleton and stays within 360px", () => {
  const pageSkeletonSource = readSource("src/components/PageSkeleton.tsx");
  const skeletonSource = readSource("src/components/ui/skeleton.tsx");

  assert.match(skeletonSource, /from "@\/lib\/utils"/);
  assert.match(skeletonSource, /aria-hidden="true"/);
  assert.match(pageSkeletonSource, /role="status"/);
  assert.match(pageSkeletonSource, /aria-busy="true"/);
  assert.match(pageSkeletonSource, /className="sr-only"/);
  // ต้องมี variant ผ่าน cva ตามกฎ AGENTS.md
  assert.match(pageSkeletonSource, /const pageSkeletonVariants = cva\(/);
  // ต้องไม่มีการจำกัดความกว้างแบบล้นจอบนมือถือ
  assert.doesNotMatch(pageSkeletonSource, /w-\[\d{4,}px\]/);
  assert.match(pageSkeletonSource, /max-w-full/);
});
