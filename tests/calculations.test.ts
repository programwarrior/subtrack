import { describe, expect, it } from "vitest";
import { calculateNextPaymentDate, daysUntil, monthlyEquivalent, yearlyEquivalent } from "@/lib/calculations";

describe("renewal calculations", () => {
  it("clamps a January 31 monthly renewal to February's last day", () => expect(calculateNextPaymentDate("2025-01-31", "monthly")).toBe("2025-02-28"));
  it("clamps leap day when adding a year", () => expect(calculateNextPaymentDate("2024-02-29", "yearly")).toBe("2025-02-28"));
  it("supports custom week and month intervals", () => { expect(calculateNextPaymentDate("2026-01-01", "custom", 3, "weeks")).toBe("2026-01-22"); expect(calculateNextPaymentDate("2026-01-31", "custom", 2, "months")).toBe("2026-03-31"); });
  it("detects overdue dates", () => expect(daysUntil("2026-07-10", "2026-07-15")).toBe(-5));
});

describe("cost normalization", () => {
  it("normalizes yearly and quarterly costs", () => { expect(monthlyEquivalent({ price: 120, billingFrequency: "yearly" })).toBe(10); expect(monthlyEquivalent({ price: 30, billingFrequency: "quarterly" })).toBe(10); });
  it("uses 52 weeks per year", () => expect(yearlyEquivalent({ price: 10, billingFrequency: "weekly" })).toBe(520));
  it("excludes one-time payments", () => expect(yearlyEquivalent({ price: 100, billingFrequency: "one-time" })).toBe(0));
});
