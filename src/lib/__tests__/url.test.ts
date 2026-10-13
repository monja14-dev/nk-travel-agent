import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "../url";

describe("safeHttpUrl", () => {
  it("allows http and https links (trimmed, any case)", () => {
    expect(safeHttpUrl("https://a.example/x")).toBe("https://a.example/x");
    expect(safeHttpUrl("  http://a.example  ")).toBe("http://a.example");
    expect(safeHttpUrl("HTTPS://A.EXAMPLE")).toBe("HTTPS://A.EXAMPLE");
  });

  it("rejects script-capable and non-web schemes, and empty values", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl(" JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
    expect(safeHttpUrl("//evil.example")).toBeNull();
    expect(safeHttpUrl("example.com")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
