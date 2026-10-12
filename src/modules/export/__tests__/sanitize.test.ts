import { describe, it, expect } from "vitest";
import { sanitizeForSpreadsheet, s } from "../sanitize";

describe("sanitizeForSpreadsheet", () => {
  it("leaves ordinary text completely unchanged", () => {
    expect(sanitizeForSpreadsheet("Dinner at Din Tai Fung")).toBe("Dinner at Din Tai Fung");
    expect(sanitizeForSpreadsheet("")).toBe("");
  });

  it("prefixes a leading apostrophe onto every OWASP-listed dangerous leading character", () => {
    expect(sanitizeForSpreadsheet("=1+1")).toBe("'=1+1");
    expect(sanitizeForSpreadsheet("+1+1")).toBe("'+1+1");
    expect(sanitizeForSpreadsheet("-1+1")).toBe("'-1+1");
    expect(sanitizeForSpreadsheet("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
  });

  it("prefixes a leading tab or carriage return", () => {
    expect(sanitizeForSpreadsheet("\t=cmd")).toBe("'\t=cmd");
    expect(sanitizeForSpreadsheet("\r=cmd")).toBe("'\r=cmd");
  });

  it("neutralizes a realistic DDE/formula-injection payload", () => {
    const payload = '=cmd|\'/C calc\'!A1';
    expect(sanitizeForSpreadsheet(payload)).toBe(`'${payload}`);
  });

  it("does not touch a dangerous character that isn't in the leading position", () => {
    expect(sanitizeForSpreadsheet("Total: =100")).toBe("Total: =100");
    expect(sanitizeForSpreadsheet("Email me at me@example.com")).toBe("Email me at me@example.com");
  });

  it("is idempotent — sanitizing an already-sanitized string is a no-op on the second pass", () => {
    const once = sanitizeForSpreadsheet("=1+1");
    expect(sanitizeForSpreadsheet(once)).toBe(once); // leading char is now "'", not dangerous
  });
});

describe("s() (optional-string convenience wrapper)", () => {
  it("passes undefined and null straight through", () => {
    expect(s(undefined)).toBeUndefined();
    expect(s(null)).toBeUndefined();
  });

  it("sanitizes a defined string the same way sanitizeForSpreadsheet does", () => {
    expect(s("=HYPERLINK(\"http://evil\")")).toBe('\'=HYPERLINK("http://evil")');
    expect(s("Normal text")).toBe("Normal text");
  });
});
