import type { ReportCategory } from "./types";

export const REPORT_CATEGORIES: Record<ReportCategory, string> = {
  connection: "Can't connect",
  slow: "Slow or unstable",
  account: "Account not working",
  other: "Something else",
};
