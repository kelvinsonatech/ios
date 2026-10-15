import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { protocolFields, protocols, serverProtocols, vpnAccounts, type Protocol, type ProtocolField } from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { UserFacingError } from "@/server/errors";
import { logEvent } from "@/server/logging/events";
import { getAdapter } from "@/server/provisioning/adapters/registry";
import type { ProtocolDefinition } from "@/server/provisioning/types";
import { normalizeIdentifier } from "./identifiers";
import { protocolSchema, type ProtocolInput } from "./validation";

import { clearPublicCache } from "@/server/public/cache";
export function toDefinition(p: Protocol, fields: ProtocolField[]): ProtocolDefinition {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    adapterKey: p.adapterKey,
    durationOptions: p.durationOptions,
    defaultDurationDays: p.defaultDurationDays,
    outputFields: p.outputFields,
    fields: [...fields]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder,
        helpText: f.helpText,
        options: f.options,
        validation: f.validation,
        defaultValue: f.defaultValue,
        displayOrder: f.displayOrder,
      })),
  };
}

export async function getProtocolWithFields(where: { id?: string; slug?: string }) {
  const cond = where.id ? eq(protocols.id, where.id) : eq(protocols.slug, where.slug ?? "");
  const [p] = await db().select().from(protocols).where(cond).limit(1);
  if (!p) return null;
  const fields = await db().select().from(protocolFields).where(eq(protocolFields.protocolId, p.id)).orderBy(asc(protocolFields.displayOrder));
  return { protocol: p, fields, definition: toDefinition(p, fields) };
}

export async function listProtocolsForAdmin() {
  return db()
    .select({
      protocol: protocols,
      serversPublished: sql<number>`(select count(*)::int from ${serverProtocols} sp join servers s on s.id = sp.server_id
        where sp.protocol_id = "protocols"."id" and sp.enabled and sp.detected and s.deleted_at is null
        and s.lifecycle in ('active', 'maintenance'))`,
      serversDetected: sql<number>`(select count(*)::int from ${serverProtocols} sp join servers s on s.id = sp.server_id
        where sp.protocol_id = "protocols"."id" and sp.detected and s.deleted_at is null)`,
      activeAccounts: sql<number>`(select count(*)::int from ${vpnAccounts} a where a.protocol_id = "protocols"."id" and a.status = 'active')`,
    })
    .from(protocols)
    .orderBy(asc(protocols.displayOrder), asc(protocols.name));
}

/** Checks that cut across fields: adapter requirements and identifier collisions. */
async function validateSemantics(input: ProtocolInput, exceptId?: string) {
  const adapter = getAdapter(input.adapterKey);
  const keys = new Set(input.fields.map((f) => f.key));
  const missing = adapter.requiredInputs.filter((k) => !keys.has(k));
  if (missing.length) {
    throw new UserFacingError(`The ${adapter.label} adapter needs these input fields: ${missing.join(", ")}.`);
  }
  for (const f of input.fields) {
    if (f.key === "username" && f.type !== "text") throw new UserFacingError(`Field "username" must be a text field.`);
    if (f.key === "password" && f.type !== "password" && f.type !== "text") {
      throw new UserFacingError(`Field "password" must be a password or text field.`);
    }
  }
  if (input.adapterKey === "generic" && input.outputFields.filter((o) => !o.hidden).length === 0) {
    throw new UserFacingError("The generic adapter needs at least one visible output field (with a path into the server's config).");
  }
  const claimed = new Set([input.slug, ...input.nodeIdentifiers].map(normalizeIdentifier));
  const others = await db()
    .select({ name: protocols.name, slug: protocols.slug, ids: protocols.nodeIdentifiers })
    .from(protocols)
    .where(exceptId ? ne(protocols.id, exceptId) : sql`true`);
  for (const o of others) {
    const clash = [o.slug, ...o.ids].map(normalizeIdentifier).find((id) => claimed.has(id));
    if (clash) throw new UserFacingError(`The identifier "${clash}" is already used by ${o.name}.`);
  }
}

async function replaceFields(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], protocolId: string, fields: ProtocolInput["fields"]) {
  const keys = fields.map((f) => f.key);
  await tx
    .delete(protocolFields)
    .where(and(eq(protocolFields.protocolId, protocolId), keys.length ? notInArray(protocolFields.key, keys) : sql`true`));
  for (const [i, f] of fields.entries()) {
    const values = {
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      helpText: f.helpText,
      options: f.options,
      validation: f.validation,
      defaultValue: f.defaultValue,
      displayOrder: (i + 1) * 10,
    };
    await tx
      .insert(protocolFields)
      .values({ protocolId, key: f.key, ...values })
      .onConflictDoUpdate({ target: [protocolFields.protocolId, protocolFields.key], set: values });
  }
}

export async function updateProtocol(id: string, raw: unknown, actor: AuditActor): Promise<void> {
  const existing = await getProtocolWithFields({ id });
  if (!existing) throw new UserFacingError("Protocol not found.");
  const input = protocolSchema.parse(raw);
  if (existing.protocol.isSystem && (input.slug !== existing.protocol.slug || input.adapterKey !== existing.protocol.adapterKey)) {
    throw new UserFacingError("The slug and adapter of built-in protocols cannot be changed.");
  }
  await validateSemantics(input, id);
  await db().transaction(async (tx) => {
    await tx
      .update(protocols)
      .set({
        name: input.name,
        slug: input.slug,
        description: input.description,
        icon: input.icon,
        category: input.category,
        adapterKey: input.adapterKey,
        nodeIdentifiers: input.nodeIdentifiers,
        enabled: input.enabled,
        displayOrder: input.displayOrder,
        durationOptions: input.durationOptions,
        defaultDurationDays: input.defaultDurationDays,
        maxAccountsPerIpPerDay: input.maxAccountsPerIpPerDay,
        outputFields: input.outputFields,
      })
      .where(eq(protocols.id, id));
    await replaceFields(tx, id, input.fields);
  });
  await logEvent({ event: "protocol.updated", status: "success", protocolId: id, adminId: actor.adminId, message: `Protocol ${input.name} updated.` });
  await audit(actor, "protocol.update", {
    targetType: "protocol",
    targetId: id,
    details: { enabled: input.enabled, identifiers: input.nodeIdentifiers, fields: input.fields.map((f) => f.key) },
  });
  clearPublicCache(); // admin changes show on public pages immediately
}

/** Create a new protocol ("Protocol X"). Servers that report one of its identifiers pick it up on the next sync. */
export async function createProtocol(raw: unknown, actor: AuditActor): Promise<string> {
  const input = protocolSchema.parse(raw);
  const [dupe] = await db().select({ id: protocols.id }).from(protocols).where(eq(protocols.slug, input.slug)).limit(1);
  if (dupe) throw new UserFacingError(`A protocol with slug "${input.slug}" already exists.`);
  await validateSemantics(input);
  const id = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(protocols)
      .values({
        slug: input.slug,
        name: input.name,
        description: input.description,
        icon: input.icon,
        category: input.category,
        adapterKey: input.adapterKey,
        nodeIdentifiers: input.nodeIdentifiers,
        enabled: input.enabled,
        isSystem: false,
        displayOrder: input.displayOrder,
        durationOptions: input.durationOptions,
        defaultDurationDays: input.defaultDurationDays,
        maxAccountsPerIpPerDay: input.maxAccountsPerIpPerDay,
        outputFields: input.outputFields,
      })
      .returning({ id: protocols.id });
    await replaceFields(tx, row!.id, input.fields);
    return row!.id;
  });
  await logEvent({ event: "protocol.created", status: "success", protocolId: id, adminId: actor.adminId, message: `Protocol ${input.name} created.` });
  await audit(actor, "protocol.create", { targetType: "protocol", targetId: id, details: { slug: input.slug, adapter: input.adapterKey } });
  clearPublicCache(); // admin changes show on public pages immediately
  return id;
}

export async function setProtocolEnabled(id: string, enabled: boolean, actor: AuditActor) {
  const [row] = await db().update(protocols).set({ enabled }).where(eq(protocols.id, id)).returning({ name: protocols.name });
  if (!row) throw new UserFacingError("Protocol not found.");
  await logEvent({
    event: "protocol.updated",
    status: "success",
    level: enabled ? "info" : "warning",
    protocolId: id,
    adminId: actor.adminId,
    message: `Protocol ${row.name} ${enabled ? "enabled" : "disabled"} globally.`,
  });
  await audit(actor, "protocol.toggle", { targetType: "protocol", targetId: id, details: { enabled } });
  clearPublicCache(); // admin changes show on public pages immediately
}

export async function getDefinitionsByIds(ids: string[]) {
  if (!ids.length) return new Map<string, ProtocolDefinition>();
  const ps = await db().select().from(protocols).where(inArray(protocols.id, ids));
  const fs = await db().select().from(protocolFields).where(inArray(protocolFields.protocolId, ids));
  return new Map(ps.map((p) => [p.id, toDefinition(p, fs.filter((f) => f.protocolId === p.id))]));
}
