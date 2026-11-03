// Money is integer paise everywhere. Rupee formatting happens only at the edge (tool output, bill).

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹52,300 (rounded to the rupee) — for chat. */
export function rupees(paise: number): string {
  return inr.format(Math.round(paise / 100));
}

/** ₹52,300.00 — for the bill. */
export function rupeesExact(paise: number): string {
  return inrExact.format(paise / 100);
}

export interface PricedLine {
  qty: number; // cases charged (qty_confirmed, or qty_requested for an estimate)
  unitPrice: number; // paise per case
  gstPct: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
  taxByRate: Record<string, number>;
}

/** LLD §5.5: line = qty × price; tax = Σ round(line × gst / 100); free qty is ₹0 and untaxed. */
export function computeTotals(lines: PricedLine[]): Totals {
  let subtotal = 0;
  let tax = 0;
  const taxByRate: Record<string, number> = {};
  for (const l of lines) {
    const line = l.qty * l.unitPrice;
    const t = Math.round((line * l.gstPct) / 100);
    subtotal += line;
    tax += t;
    taxByRate[String(l.gstPct)] = (taxByRate[String(l.gstPct)] ?? 0) + t;
  }
  return { subtotal, tax, total: subtotal + tax, taxByRate };
}
