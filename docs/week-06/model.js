/* FINC-560 Week 6: transparent, deterministic scenario math. No prediction probabilities. */
(function (root, factory) {
  "use strict";
  const model = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (root) root.YieldModel = model;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  function finite(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(label + " must be a finite number");
    return n;
  }

  // Observational, contemporaneous monthly first-difference OLS. This is NOT
  // an identified causal effect of a surprise Federal Reserve policy change.
  function fitSensitivities(rows) {
    if (!Array.isArray(rows) || rows.length < 14) return null;
    const pairs = [];
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1], cur = rows[i];
      const gap = (new Date(cur.date).getTime() - new Date(prev.date).getTime()) / 86400000;
      if (gap < 25 || gap > 35) continue; // don't bridge missing months
      const policy = cur.policy - prev.policy;
      const d5 = cur.dgs5 - prev.dgs5, d10 = cur.dgs10 - prev.dgs10;
      if ([policy, d5, d10].every(Number.isFinite)) pairs.push([policy, d5, d10]);
    }
    if (pairs.length < 12) return null;
    const average = col => pairs.reduce((acc, row) => acc + row[col], 0) / pairs.length;
    const xbar = average(0), y5bar = average(1), y10bar = average(2);
    const denom = pairs.reduce((acc, row) => acc + (row[0] - xbar) ** 2, 0);
    if (denom < 1e-8) return null;
    const slope = (col, mean) => pairs.reduce(
      (acc, row) => acc + (row[0] - xbar) * (row[col] - mean), 0
    ) / denom;
    return { beta5: slope(1, y5bar), beta10: slope(2, y10bar), samples: pairs.length };
  }

  function lastYears(rows, years) {
    if (!rows.length || years === "all") return rows;
    const end = new Date(rows[rows.length - 1].date + "T00:00:00Z");
    const first = new Date(end);
    first.setUTCFullYear(first.getUTCFullYear() - finite(years, "years"));
    return rows.filter(row => new Date(row.date + "T00:00:00Z") >= first);
  }

  // Path is linear by design: terminal yield response = user-specified beta
  // x hypothetical policy-rate change. The interval is a user-defined
  // sensitivity corridor, NOT a confidence interval or event probability.
  function project(base, deltaBp, beta5, beta10, months, corridorBp) {
    const shock = finite(deltaBp, "policy adjustment") / 100;
    const b5 = finite(beta5, "5Y response"), b10 = finite(beta10, "10Y response");
    const horizon = finite(months, "months"), corridor = finite(corridorBp, "corridor");
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 36 || corridor < 0) {
      throw new Error("Invalid projection horizon or corridor");
    }
    const initial5 = finite(base.dgs5, "latest 5Y yield");
    const initial10 = finite(base.dgs10, "latest 10Y yield");
    const initialDate = new Date(String(base.date).slice(0, 7) + "-01T00:00:00Z");
    if (Number.isNaN(initialDate.getTime())) throw new Error("Invalid baseline date");
    const path = [];
    for (let month = 0; month <= horizon; month += 1) {
      const fraction = month / horizon;
      const date = new Date(initialDate);
      date.setUTCMonth(date.getUTCMonth() + month);
      const y5 = initial5 + shock * b5 * fraction;
      const y10 = initial10 + shock * b10 * fraction;
      const spread = y10 - y5;
      const width = corridor / 100 * fraction;
      path.push({
        date: date.toISOString().slice(0, 10),
        month, y5, y10, spread,
        lower: spread - width,
        upper: spread + width
      });
    }
    let crossing = null;
    if (path[0].spread < 0) {
      crossing = { kind: "already", month: 0 };
    } else {
      for (let i = 1; i < path.length; i += 1) {
        if (path[i - 1].spread > 0 && path[i].spread <= 0) {
          const before = path[i - 1].spread, after = path[i].spread;
          crossing = { kind: "crossing", month: (i - 1) + before / (before - after) };
          break;
        }
        if (path[i - 1].spread === 0 && path[i].spread < 0) {
          crossing = { kind: "crossing", month: i - 1 };
          break;
        }
      }
    }
    return { path, crossing, terminal: path[path.length - 1] };
  }

  return { fitSensitivities, lastYears, project };
});
