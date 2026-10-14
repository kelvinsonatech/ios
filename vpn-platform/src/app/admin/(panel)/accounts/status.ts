/** Account status labels and badge colours, shared by the server page and the client row actions. */
export type AccountStatusName = "pending" | "active" | "expired" | "revoked" | "failed";

export const ACCOUNT_STATUS: Record<AccountStatusName, { label: string; variant: "success" | "info" | "muted" | "warning" | "danger" }> = {
  active: { label: "Active", variant: "success" },
  pending: { label: "Pending", variant: "info" },
  expired: { label: "Expired", variant: "muted" },
  revoked: { label: "Revoked", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
};
