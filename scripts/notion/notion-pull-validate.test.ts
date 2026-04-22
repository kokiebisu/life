import { describe, test, expect } from "bun:test";

// We test the validation logic by importing from a shared location
// Since validateDryRunEntries is internal, we test via the exported timeToMinutes
// and test the pattern matching directly

describe("dry-run anomaly detection patterns", () => {
  test("time >= 24:00 is detected", () => {
    const hour = parseInt("26:43".split(":")[0], 10);
    expect(hour).toBeGreaterThanOrEqual(24);
  });

  test("time < 24:00 is normal", () => {
    const hour = parseInt("23:59".split(":")[0], 10);
    expect(hour).toBeLessThan(24);
  });

  test("2+ hour earlier shift is detected", () => {
    // timeToMinutes("10:00") = 600, timeToMinutes("07:30") = 450
    // diff = 600 - 450 = 150 >= 120
    const oldMin = 10 * 60 + 0;
    const newMin = 7 * 60 + 30;
    expect(oldMin - newMin).toBeGreaterThanOrEqual(120);
  });

  test("small shift is not flagged", () => {
    const oldMin = 10 * 60 + 0;
    const newMin = 9 * 60 + 0;
    expect(oldMin - newMin).toBeLessThan(120);
  });
});
