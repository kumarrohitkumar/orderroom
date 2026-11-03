import { describe, expect, it } from "vitest";
import { ORDERROOM_VERSION } from "../src/index.js";

describe("scaffold", () => {
  it("builds and runs tests", () => {
    expect(ORDERROOM_VERSION).toBe("0.1.0");
  });
});
