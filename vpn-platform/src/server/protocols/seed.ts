import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { protocolFields, protocols } from "@/server/db/schema";
import { PROTOCOL_SEEDS } from "./seed-data";

/**
 * Insert the built-in protocols. Idempotent and non-destructive: existing protocols (and any
 * admin edits to them) are left untouched; only missing protocols are created.
 */
export async function seedProtocols(tx: DbOrTx = db()): Promise<{ created: string[] }> {
  const created: string[] = [];
  for (const p of PROTOCOL_SEEDS) {
    const [row] = await tx
      .insert(protocols)
      .values({
        slug: p.slug,
        name: p.name,
        description: p.description,
        icon: p.icon,
        category: p.category,
        adapterKey: p.adapterKey,
        nodeIdentifiers: p.nodeIdentifiers,
        enabled: true,
        isSystem: true,
        displayOrder: p.displayOrder,
        durationOptions: p.durationOptions,
        defaultDurationDays: p.defaultDurationDays,
        outputFields: p.outputFields,
      })
      .onConflictDoNothing({ target: protocols.slug })
      .returning({ id: protocols.id });
    if (!row) continue;
    created.push(p.slug);
    await tx.insert(protocolFields).values(
      p.fields.map((f, i) => ({
        protocolId: row.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder ?? null,
        helpText: f.helpText ?? null,
        options: f.options,
        validation: f.validation,
        defaultValue: f.defaultValue ?? null,
        displayOrder: (i + 1) * 10,
      })),
    );
  }
  return { created };
}

export async function protocolExists(slug: string) {
  const [row] = await db().select({ id: protocols.id }).from(protocols).where(eq(protocols.slug, slug)).limit(1);
  return !!row;
}
