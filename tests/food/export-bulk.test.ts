import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserSetup } from "@/features/expenses/server/service";
import { validateFoodBulk, type FoodBulkRowInput } from "@/features/food/bulk";
import { buildFoodPdf, buildFoodXlsx, contentDisposition, defaultFileName, sanitizeFileName } from "@/features/food/export";
import { addFoodItem, createFoodBulk, listFoodEntries } from "@/features/food/server/service";
import type { FoodEntryRow } from "@/features/food/types";
import { istInstant } from "@/features/quick-pay/datetime";
import { startTestDatabase, type TestDatabase } from "../db/test-database";

describe("file names", () => {
  it("defaults to the months being exported", () => {
    expect(defaultFileName(["2026-06"])).toBe("Monthly Food Tracking 2026-06");
    expect(defaultFileName(["2026-06", "2026-07", "2026-08"])).toBe("Monthly Food Tracking 2026-06 to 2026-08");
  });
  it("keeps an ordinary typed name, with any extension removed", () => {
    expect(sanitizeFileName("June food bill")).toBe("June food bill");
    expect(sanitizeFileName("June.xlsx")).toBe("June");
    expect(sanitizeFileName("Report.PDF")).toBe("Report");
  });
  it("removes folders, reserved characters and dots so it cannot escape or break the download", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc passwd");
    expect(sanitizeFileName('a<b>c:"d"|e?f*')).toBe("a b c d e f");
    expect(sanitizeFileName("..hidden")).toBe("hidden");
    expect(sanitizeFileName("bad\r\nname")).toBe("bad name");
    expect(sanitizeFileName("CON")).toBe("CON-file");
  });
  it("returns null when nothing usable is left, and caps the length", () => {
    expect(sanitizeFileName("   ")).toBeNull();
    expect(sanitizeFileName("///")).toBeNull();
    expect(sanitizeFileName(null)).toBeNull();
    expect(sanitizeFileName("x".repeat(300))!.length).toBe(100);
  });
  it("builds a safe download header with the extension and a UTF-8 name", () => {
    expect(contentDisposition("June bill", "pdf")).toBe(`attachment; filename="June bill.pdf"; filename*=UTF-8''June%20bill.pdf`);
    const unicode = contentDisposition("உணவு", "xlsx");
    expect(unicode).toContain("filename*=UTF-8''");
    expect(unicode).not.toMatch(/filename="[^"]*[^\x20-\x7e][^"]*"/);
  });
});

const rows: FoodEntryRow[] = [
  { id: "1", meal: "TIFFIN", notes: "Idli", amountPaise: 4000, occurredAt: istInstant("2026-06-10", "08:15").toISOString() },
  { id: "2", meal: "LUNCH", notes: "Fish Gravy", amountPaise: 6000, occurredAt: istInstant("2026-06-10", "13:05").toISOString() },
  { id: "3", meal: "DINNER", notes: "Dosa", amountPaise: 4000, occurredAt: istInstant("2026-06-11", "20:30").toISOString() },
];
const meta = { months: ["2026-06"], totalPaise: 14000, generatedAt: new Date("2026-06-30T06:00:00Z") };

describe("exports", () => {
  it("writes the Excel file with real date, time, day, amount and running total cells", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await buildFoodXlsx(rows, meta)) as never);
    const sheet = workbook.getWorksheet("Monthly Food Tracking")!;
    const header = sheet.getRow(6).values as unknown[];
    expect(header.slice(1)).toEqual(["Date", "Time", "Day", "Meal", "Food Item", "Amount", "Total Amount"]);

    const second = sheet.getRow(8);
    expect(second.getCell(3).value).toBe("Wednesday");
    expect(second.getCell(4).value).toBe("Lunch");
    expect(second.getCell(5).value).toBe("Fish Gravy");
    expect(second.getCell(6).value).toBe(60);
    expect(second.getCell(7).value).toBe(100); // 40 + 60
    expect(sheet.getRow(9).getCell(7).value).toBe(140);
    const total = sheet.getRow(10);
    expect([total.getCell(1).value, total.getCell(6).value, total.getCell(7).value]).toEqual(["Total", 140, 140]);
    expect(sheet.getRow(3).getCell(2).value).toBe(140);
  });

  it("writes a PDF, and one with no rows still works", () => {
    const pdf = buildFoodPdf(rows, meta);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.pages).toBe(1);
    expect(buildFoodPdf([], { ...meta, totalPaise: 0 }).pages).toBe(1);
  });
});

const row = (over: Partial<FoodBulkRowInput> & { key: string }): FoodBulkRowInput => ({ date: "2026-06-10", time: "13:00", meal: "LUNCH", notes: "", ...over });
const NOW = new Date("2026-06-30T06:00:00Z");

describe("bulk validation", () => {
  it("skips rows with no notes and keeps the valid ones", () => {
    const out = validateFoodBulk([row({ key: "a", notes: "Fish Gravy" }), row({ key: "b" }), row({ key: "c", notes: " Idli ", meal: "TIFFIN", time: "08:00" })], NOW);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.rows.map((r) => [r.key, r.meal, r.notes])).toEqual([["a", "LUNCH", "Fish Gravy"], ["c", "TIFFIN", "Idli"]]);
      expect(out.rows[0]!.occurredAt.toISOString()).toBe("2026-06-10T07:30:00.000Z");
    }
  });
  it("reports each bad row and saves nothing", () => {
    const out = validateFoodBulk(
      [row({ key: "a", notes: "ok" }), row({ key: "b", notes: "x", date: "2026-07-05" }), row({ key: "c", notes: "x", meal: "SNACK" }), row({ key: "d", notes: "x", time: "" }), row({ key: "e", notes: "x", date: "nope" })],
      NOW,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(Object.keys(out.errors).sort()).toEqual(["b", "c", "d", "e"]);
      expect(out.errors.b!.date).toMatch(/future/);
      expect(out.errors.c!.meal).toBeDefined();
      expect(out.message).toBe("4 rows need fixing before anything is saved.");
    }
  });
  it("needs at least one filled row and limits the sheet size", () => {
    expect(validateFoodBulk([row({ key: "a" })], NOW)).toMatchObject({ ok: false, message: "Add at least one row with notes." });
    const many = Array.from({ length: 501 }, (_, i) => row({ key: String(i), notes: "x" }));
    expect(validateFoodBulk(many, NOW)).toMatchObject({ ok: false });
  });
});

describe("bulk save", () => {
  const ME = { id: "55555555-5555-4555-8555-555555555555", email: "food-bulk@example.com", name: "Me" };
  let database: TestDatabase;
  let db: TestDatabase["prisma"];

  beforeAll(async () => {
    database = await startTestDatabase();
    db = database.prisma;
    await ensureUserSetup(db, ME);
    await addFoodItem(db, ME.id, { meal: "LUNCH", name: "Fish Gravy", pricePaise: 6000 });
  });
  afterAll(async () => {
    await database.close();
  });

  const valid = (key: string, meal: "TIFFIN" | "LUNCH" | "DINNER", notes: string, date: string, time: string) => ({ key, meal, notes, occurredAt: istInstant(date, time) });

  it("saves every row with its own time and price, appears in the month list, and a repeat saves nothing", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    const sheet = [
      valid("a", "TIFFIN", "Idli", "2026-06-01", "08:00"),
      valid("b", "LUNCH", "Fish Gravy", "2026-06-01", "13:00"),
      valid("c", "LUNCH", "Curd rice", "2026-06-02", "13:10"),
      valid("d", "DINNER", "Dosa", "2026-06-02", "20:00"),
    ] as const;
    const saved = await createFoodBulk(db, ME.id, id, sheet);
    expect(saved).toEqual({ count: 4, duplicate: false, totalPaise: 4000 + 6000 + 5000 + 4000 });

    const month = await listFoodEntries(db, ME.id, "2026-06", "2026-06");
    expect(month.rows.map((r) => [r.notes, r.amountPaise])).toEqual([["Idli", 4000], ["Fish Gravy", 6000], ["Curd rice", 5000], ["Dosa", 4000]]);
    expect(month.totalPaise).toBe(19000);

    const again = await createFoodBulk(db, ME.id, id, sheet);
    expect(again.duplicate).toBe(true);
    expect((await listFoodEntries(db, ME.id, "2026-06", "2026-06")).count).toBe(4);
  });
});
