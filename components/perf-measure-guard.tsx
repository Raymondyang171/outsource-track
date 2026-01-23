"use client";

import { useEffect } from "react";

export default function PerfMeasureGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return;

    const original = performance.measure.bind(performance);
    performance.measure = function (name, startOrOptions, end) {
      try {
        if (startOrOptions && typeof startOrOptions === "object" && "end" in startOrOptions) {
          const endValue = (startOrOptions as { end?: number }).end;
          if (typeof endValue === "number" && endValue < 0) {
            return;
          }
        }
        return original(name, startOrOptions as any, end as any);
      } catch (err) {
        if (String(err).includes("negative time stamp")) {
          return;
        }
        throw err;
      }
    };
  }, []);

  return null;
}
