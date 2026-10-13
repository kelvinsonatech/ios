import type { z } from "zod";
import type {
  FieldOption,
  FieldValidation,
  OutputFieldDefinition,
  OutputFieldKind,
  PortMap,
  ProtocolFieldType,
} from "@/server/db/schema";
import type { NodeAccount } from "@/server/nodes/contract";
import type { AccountSpec } from "@/server/nodes/driver";

export interface ProtocolFieldDefinition {
  key: string;
  label: string;
  type: ProtocolFieldType;
  required: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  options: FieldOption[];
  validation: FieldValidation;
  defaultValue?: string | null;
  displayOrder: number;
}

/** A protocol as loaded from the database (protocols + protocol_fields). */
export interface ProtocolDefinition {
  id: string;
  slug: string;
  name: string;
  adapterKey: string;
  durationOptions: number[];
  defaultDurationDays: number;
  fields: ProtocolFieldDefinition[];
  outputFields: OutputFieldDefinition[];
}

/** Validated, normalized account request (the website's universal shape). */
export interface NormalizedAccountInput {
  username?: string;
  password?: string;
  durationDays: number;
  /** Any other declared fields, e.g. { transport: "ws" }. */
  options: Record<string, string>;
}

export interface AdapterContext {
  protocol: ProtocolDefinition;
  server: { id: string; name: string; hostname: string; ipAddress: string };
  serverProtocol: {
    nodeIdentifier: string | null;
    ports: PortMap;
    transports: string[];
    metadata: Record<string, unknown>;
  };
}

export interface OutputValue {
  value: string;
  /** Sensitive values are delivered to the user once and never stored in the database. */
  sensitive: boolean;
}

export interface Artifact {
  key: string;
  label: string;
  kind: "uri" | "file";
  content: string;
  filename?: string;
  mimeType?: string;
  qr: boolean;
  sensitive: boolean;
}

/** Adapter output: normalized result of a node account. */
export interface ProvisionedAccount {
  remoteAccountId: string;
  username?: string;
  expiresAt: Date;
  values: Record<string, OutputValue>;
  artifacts: Artifact[];
}

export type SeedField = Omit<ProtocolFieldDefinition, "displayOrder">;

export interface ProtocolAdapter {
  key: string;
  label: string;
  description: string;
  /**
   * Hard safety constraints for well-known input keys. They are applied after the admin-defined
   * field validation and cannot be relaxed from the admin panel (values may reach shell scripts).
   */
  inputGuards: Partial<Record<string, z.ZodType<string, string>>>;
  /** Input field keys that must exist in the protocol definition for this adapter to work. */
  requiredInputs: string[];
  supportsRenew: boolean;
  /** Output keys this adapter can produce, with default presentation. */
  outputFields: OutputFieldDefinition[];
  /** Default input fields used when seeding a protocol with this adapter. */
  defaultFields: SeedField[];
  buildSpec(input: NormalizedAccountInput, ctx: AdapterContext): AccountSpec;
  /** Validate and normalize the node's account (throws AdapterResponseError when unusable). */
  parseAccount(account: NodeAccount, ctx: AdapterContext, input: NormalizedAccountInput): ProvisionedAccount;
}

export interface PresentedField {
  key: string;
  label: string;
  kind: OutputFieldKind;
  value: string;
  sensitive: boolean;
  copyable: boolean;
  qr: boolean;
}

/** What the end user finally receives (built from ProvisionedAccount + admin presentation settings). */
export interface PresentedAccount {
  protocol: { slug: string; name: string };
  server: { id: string; name: string };
  username?: string;
  expiresAt: string;
  fields: PresentedField[];
  artifacts: Artifact[];
}
