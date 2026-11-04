import { describe, expect, it } from "vitest";
import { findProduct, findRetailer } from "../src/domain/reads.js";
import { freshDb } from "./helpers.js";

const db = freshDb();

describe("matching", () => {
  it.each([
    ["Sharma store", "Sharma General Store"],
    ["sharma ji", "Sharma General Store"],
    ["gupta provision", "Gupta Provision Store"],
    ["verma kirana", "Verma Kirana"],
    ["khan bakers", "Khan Bakers & General"],
  ])("party %s → %s (unique)", (q, name) => {
    const r = findRetailer(db, q);
    expect(r.status).toBe("unique");
    expect(r.matches[0]?.name).toBe(name);
  });

  it("Singh is ambiguous between Traders and Stores", () => {
    const r = findRetailer(db, "singh");
    expect(r.status).toBe("ambiguous");
    expect(r.matches.map((m) => m.name).sort()).toEqual(["Singh Stores", "Singh Traders"]);
  });

  it.each([
    ["noodles", "Crunchy Masala Noodles 70g"],
    ["nudal", "Crunchy Masala Noodles 70g"],
    ["glucose biscuit", "Gold Glucose Biscuits"],
    ["chai", "Assam Gold Tea 250g"],
    ["surf", "Brite Wash Detergent 1kg"],
    ["bhujia", "Aloo Bhujia 40g"],
  ])("product %s → %s", (q, name) => {
    const r = findProduct(db, q);
    expect(r.status).toBe("unique");
    expect(r.matches[0]?.name).toBe(name);
  });

  it("typos still find the party", () => {
    expect(findRetailer(db, "sharmaa").matches[0]?.name).toBe("Sharma General Store");
  });

  it("nonsense finds nothing", () => {
    expect(findRetailer(db, "xyzzy qwerty").status).toBe("none");
  });
});

describe("unique matches come back alone", () => {
  it("noodles → only the 70g pack, no runner-up to tempt a question", () => {
    const r = findProduct(db, "noodles");
    expect(r.status).toBe("unique");
    expect(r.matches).toHaveLength(1);
  });
});
