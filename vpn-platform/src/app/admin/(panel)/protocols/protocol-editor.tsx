"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, LoaderCircleIcon, PlusIcon, RotateCcwIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/admin/form-field";
import { ProtocolIcon } from "@/components/protocol-icon";
import type { ActionState } from "@/lib/action-state";
import type { FieldOption, FieldValidation, OutputFieldDefinition, ProtocolFieldType } from "@/server/db/schema";

export interface EditorField {
  key: string;
  label: string;
  type: ProtocolFieldType;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  options: FieldOption[];
  validation: FieldValidation;
  defaultValue: string | null;
}

export interface ProtocolEditorValue {
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: "ssh" | "v2ray" | "vpn" | "proxy";
  adapterKey: string;
  nodeIdentifiers: string[];
  enabled: boolean;
  displayOrder: number;
  durationOptions: number[];
  defaultDurationDays: number;
  maxAccountsPerIpPerDay: number;
  fields: EditorField[];
  outputFields: OutputFieldDefinition[];
}

export interface AdapterInfo {
  key: string;
  label: string;
  description: string;
  requiredInputs: string[];
  outputFields: OutputFieldDefinition[];
  defaultFields: EditorField[];
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
}

const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));

function FieldEditor({
  field,
  onChange,
  onRemove,
  onMove,
  required,
  disabled,
}: {
  field: EditorField;
  onChange: (f: EditorField) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  required: boolean;
  disabled: boolean;
}) {
  const set = <K extends keyof EditorField>(k: K, v: EditorField[K]) => onChange({ ...field, [k]: v });
  const setV = <K extends keyof FieldValidation>(k: K, v: FieldValidation[K]) => onChange({ ...field, validation: { ...field.validation, [k]: v } });
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-medium">{field.key || "new_field"}</span>
        <Badge variant="secondary">{field.type}</Badge>
        {required ? <Badge variant="info">Required by adapter</Badge> : null}
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={disabled} aria-label="Move up">
            <ArrowUpIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={disabled} aria-label="Move down">
            <ArrowDownIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={disabled || required} aria-label="Remove field">
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id={`k-${field.key}`} label="Key">
          <Input value={field.key} onChange={(e) => set("key", e.target.value.toLowerCase())} disabled={disabled || required} className="font-mono" />
        </FormField>
        <FormField id={`l-${field.key}`} label="Label">
          <Input value={field.label} onChange={(e) => set("label", e.target.value)} disabled={disabled} />
        </FormField>
        <FormField id={`t-${field.key}`} label="Type">
          <NativeSelect value={field.type} onChange={(e) => set("type", e.target.value as ProtocolFieldType)} disabled={disabled}>
            <option value="text">Text</option>
            <option value="password">Password</option>
            <option value="select">Select</option>
            <option value="number">Number</option>
            <option value="duration">Duration</option>
          </NativeSelect>
        </FormField>
        <FormField id={`p-${field.key}`} label="Placeholder" optional>
          <Input value={field.placeholder ?? ""} onChange={(e) => set("placeholder", e.target.value || null)} disabled={disabled} />
        </FormField>
        <FormField id={`h-${field.key}`} label="Help text" optional className="sm:col-span-2">
          <Input value={field.helpText ?? ""} onChange={(e) => set("helpText", e.target.value || null)} disabled={disabled} />
        </FormField>
        {field.type === "text" || field.type === "password" ? (
          <>
            <FormField id={`min-${field.key}`} label="Min length" optional>
              <Input type="number" value={field.validation.minLength ?? ""} onChange={(e) => setV("minLength", numOrUndef(e.target.value))} disabled={disabled} />
            </FormField>
            <FormField id={`max-${field.key}`} label="Max length" optional>
              <Input type="number" value={field.validation.maxLength ?? ""} onChange={(e) => setV("maxLength", numOrUndef(e.target.value))} disabled={disabled} />
            </FormField>
            <FormField id={`re-${field.key}`} label="Pattern (regex)" optional hint="Anchored automatically. Adapter safety rules always apply too.">
              <Input value={field.validation.pattern ?? ""} onChange={(e) => setV("pattern", e.target.value || undefined)} disabled={disabled} className="font-mono" />
            </FormField>
          </>
        ) : null}
        {field.type === "number" ? (
          <>
            <FormField id={`nmin-${field.key}`} label="Minimum" optional>
              <Input type="number" value={field.validation.min ?? ""} onChange={(e) => setV("min", numOrUndef(e.target.value))} disabled={disabled} />
            </FormField>
            <FormField id={`nmax-${field.key}`} label="Maximum" optional>
              <Input type="number" value={field.validation.max ?? ""} onChange={(e) => setV("max", numOrUndef(e.target.value))} disabled={disabled} />
            </FormField>
          </>
        ) : null}
        {field.type === "select" ? (
          <FormField id={`o-${field.key}`} label="Options" hint="One per line as value:Label, e.g. ws:WebSocket" className="sm:col-span-2">
            <Textarea
              rows={3}
              className="font-mono text-xs"
              defaultValue={field.options.map((o) => `${o.value}:${o.label}`).join("\n")}
              onBlur={(e) =>
                set(
                  "options",
                  e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((l) => {
                      const [value, ...rest] = l.split(":");
                      return { value: (value ?? "").trim(), label: rest.join(":").trim() || (value ?? "").trim() };
                    }),
                )
              }
              disabled={disabled}
            />
          </FormField>
        ) : null}
        {field.type === "select" || field.type === "text" ? (
          <FormField id={`d-${field.key}`} label="Default value" optional>
            <Input value={field.defaultValue ?? ""} onChange={(e) => set("defaultValue", e.target.value || null)} disabled={disabled} />
          </FormField>
        ) : null}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={field.required} onCheckedChange={(v) => set("required", v === true)} disabled={disabled || required} />
          Required
        </label>
      </div>
    </div>
  );
}

function FormPreview({ value }: { value: ProtocolEditorValue }) {
  return (
    <div className="grid gap-3">
      {value.fields.map((f) => (
        <div key={f.key} className="grid gap-1.5">
          <Label>{f.label || f.key}</Label>
          {f.type === "duration" ? (
            <NativeSelect disabled defaultValue={value.defaultDurationDays}>
              {value.durationOptions.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </NativeSelect>
          ) : f.type === "select" ? (
            <NativeSelect disabled>
              {f.options.map((o) => (
                <option key={o.value}>{o.label}</option>
              ))}
            </NativeSelect>
          ) : (
            <Input disabled type={f.type === "password" ? "password" : "text"} placeholder={f.placeholder ?? ""} />
          )}
          {f.helpText ? <p className="text-xs text-muted-foreground">{f.helpText}</p> : null}
        </div>
      ))}
      <Button disabled className="mt-1">
        Create account
      </Button>
    </div>
  );
}

export function ProtocolEditor({
  mode,
  initial,
  isSystem,
  adapters,
  icons,
  canEdit,
  action,
}: {
  mode: "edit" | "create";
  initial: ProtocolEditorValue;
  isSystem: boolean;
  adapters: AdapterInfo[];
  icons: readonly string[];
  canEdit: boolean;
  action: (json: string) => Promise<ActionState>;
}) {
  const [v, setV] = useState<ProtocolEditorValue>(initial);
  const [identifiers, setIdentifiers] = useState(initial.nodeIdentifiers.join(", "));
  const [durations, setDurations] = useState(initial.durationOptions.join(", "));
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const adapter = useMemo(() => adapters.find((a) => a.key === v.adapterKey), [adapters, v.adapterKey]);
  const set = <K extends keyof ProtocolEditorValue>(k: K, val: ProtocolEditorValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const disabled = !canEdit;
  const isGeneric = v.adapterKey === "generic";
  // Values the adapter marks as secret can never be downgraded to public in the admin panel.
  const adapterSecret = new Set((adapter?.outputFields ?? []).filter((o) => o.sensitive).map((o) => o.key));

  const parsedDurations = durations
    .split(/[,\s]+/)
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d > 0);

  const submit = () => {
    const payload: ProtocolEditorValue = {
      ...v,
      nodeIdentifiers: identifiers.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      durationOptions: parsedDurations,
    };
    start(async () => {
      const r = await action(JSON.stringify(payload));
      setErrors(r.fieldErrors ?? {});
      if (r.error) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });
  };

  const changeAdapter = (key: string) => {
    const a = adapters.find((x) => x.key === key);
    if (!a) return;
    setV((p) => ({ ...p, adapterKey: key, fields: a.defaultFields, outputFields: a.outputFields }));
  };

  const err = (k: string) => errors[k];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="name" label="Display name" errors={err("name")}>
              <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} disabled={disabled} />
            </FormField>
            <FormField id="slug" label="Slug (page URL)" errors={err("slug")} hint={isSystem ? "Built-in protocols keep their slug." : `Public page: /${v.slug || "slug"}`}>
              <Input id="slug" value={v.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} disabled={disabled || isSystem} className="font-mono" />
            </FormField>
            <FormField id="description" label="Description" errors={err("description")} className="sm:col-span-2">
              <Textarea id="description" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} disabled={disabled} />
            </FormField>
            <FormField id="icon" label="Icon">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <ProtocolIcon name={v.icon} className="size-4" />
                </span>
                <NativeSelect id="icon" value={v.icon} onChange={(e) => set("icon", e.target.value)} disabled={disabled}>
                  {icons.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </FormField>
            <FormField id="category" label="Category">
              <NativeSelect id="category" value={v.category} onChange={(e) => set("category", e.target.value as ProtocolEditorValue["category"])} disabled={disabled}>
                <option value="ssh">SSH</option>
                <option value="v2ray">V2Ray / Xray</option>
                <option value="vpn">VPN</option>
                <option value="proxy">Proxy</option>
              </NativeSelect>
            </FormField>
            <FormField id="adapter" label="Provisioning adapter" errors={err("adapterKey")} hint={adapter?.description}>
              <NativeSelect id="adapter" value={v.adapterKey} onChange={(e) => changeAdapter(e.target.value)} disabled={disabled || isSystem || mode === "edit"}>
                {adapters.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label} ({a.key})
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="displayOrder" label="Display order" errors={err("displayOrder")}>
              <Input id="displayOrder" type="number" value={v.displayOrder} onChange={(e) => set("displayOrder", Number(e.target.value))} disabled={disabled} />
            </FormField>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <Switch checked={v.enabled} onCheckedChange={(c) => set("enabled", c)} disabled={disabled} />
              Enabled — show this protocol&apos;s page and list its servers
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Server detection</CardTitle>
            <CardDescription>
              Identifiers a server may report for this protocol. Matching ignores case, spaces and _/-. Any server that reports one of these
              is offered on this protocol&apos;s page once an admin enables it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField id="identifiers" label="Identifiers" errors={err("nodeIdentifiers")} hint="Comma separated">
              <Input id="identifiers" value={identifiers} onChange={(e) => setIdentifiers(e.target.value)} disabled={disabled} className="font-mono" placeholder="vless, xray-vless" />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Durations & limits</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField id="durations" label="Duration options (days)" errors={err("durationOptions")} hint="Comma separated">
              <Input id="durations" value={durations} onChange={(e) => setDurations(e.target.value)} disabled={disabled} />
            </FormField>
            <FormField id="defaultDuration" label="Default duration" errors={err("defaultDurationDays")}>
              <NativeSelect id="defaultDuration" value={v.defaultDurationDays} onChange={(e) => set("defaultDurationDays", Number(e.target.value))} disabled={disabled}>
                {parsedDurations.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="perIp" label="Accounts per IP per day" errors={err("maxAccountsPerIpPerDay")}>
              <Input id="perIp" type="number" min={1} value={v.maxAccountsPerIpPerDay} onChange={(e) => set("maxAccountsPerIpPerDay", Number(e.target.value))} disabled={disabled} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Input fields</CardTitle>
            <CardDescription>What users fill in on the public form. {adapter?.requiredInputs.length ? `The ${adapter.label} adapter needs: ${adapter.requiredInputs.join(", ")}.` : null}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {err("fields") ? <p className="text-sm text-destructive">{err("fields")?.[0]}</p> : null}
            {v.fields.map((f, i) => (
              <FieldEditor
                key={i}
                field={f}
                required={!!adapter?.requiredInputs.includes(f.key)}
                disabled={disabled}
                onChange={(nf) => set("fields", v.fields.map((x, j) => (j === i ? nf : x)))}
                onRemove={() => set("fields", v.fields.filter((_, j) => j !== i))}
                onMove={(d) => set("fields", move(v.fields, i, d))}
              />
            ))}
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() =>
                  set("fields", [
                    ...v.fields,
                    { key: `field_${v.fields.length + 1}`, label: "New field", type: "text", required: false, placeholder: null, helpText: null, options: [], validation: {}, defaultValue: null },
                  ])
                }
              >
                <PlusIcon /> Add field
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output fields</CardTitle>
            <CardDescription>
              {isGeneric
                ? "Map values from the server's account config (dot paths) to what users see. URI and file outputs become QR codes / downloads."
                : "Values produced by the adapter. Relabel, reorder or hide them; secrets are always shown once and never stored."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {err("outputFields") ? <p className="text-sm text-destructive">{err("outputFields")?.[0]}</p> : null}
            {v.outputFields.map((o, i) => (
              <div key={i} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                <Input
                  value={o.key}
                  onChange={(e) => set("outputFields", v.outputFields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                  disabled={disabled || !isGeneric}
                  className="font-mono text-xs"
                  aria-label="Key"
                />
                <Input
                  value={o.label}
                  onChange={(e) => set("outputFields", v.outputFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  disabled={disabled}
                  aria-label="Label"
                />
                <NativeSelect
                  value={o.kind}
                  onChange={(e) => set("outputFields", v.outputFields.map((x, j) => (j === i ? { ...x, kind: e.target.value as OutputFieldDefinition["kind"] } : x)))}
                  disabled={disabled || !isGeneric}
                  aria-label="Kind"
                >
                  <option value="text">Text</option>
                  <option value="secret">Secret</option>
                  <option value="uri">URI + QR</option>
                  <option value="multiline">Multiline</option>
                  <option value="file">File</option>
                </NativeSelect>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={!o.hidden}
                      onCheckedChange={(c) => set("outputFields", v.outputFields.map((x, j) => (j === i ? { ...x, hidden: c !== true } : x)))}
                      disabled={disabled}
                    />
                    Show
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={o.sensitive}
                      onCheckedChange={(c) => set("outputFields", v.outputFields.map((x, j) => (j === i ? { ...x, sensitive: c === true } : x)))}
                      disabled={disabled || (!isGeneric && adapterSecret.has(o.key))}
                    />
                    Secret
                  </label>
                  <span className="flex">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("outputFields", move(v.outputFields, i, -1))} disabled={disabled} aria-label="Up">
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("outputFields", move(v.outputFields, i, 1))} disabled={disabled} aria-label="Down">
                      <ArrowDownIcon />
                    </Button>
                    {isGeneric ? (
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("outputFields", v.outputFields.filter((_, j) => j !== i))} disabled={disabled} aria-label="Remove">
                        <Trash2Icon />
                      </Button>
                    ) : null}
                  </span>
                </div>
                {isGeneric ? (
                  <Input
                    value={o.path ?? ""}
                    placeholder="config path, e.g. ports.tcp"
                    onChange={(e) => set("outputFields", v.outputFields.map((x, j) => (j === i ? { ...x, path: e.target.value || undefined } : x)))}
                    disabled={disabled}
                    className="font-mono text-xs sm:col-span-4"
                    aria-label="Path"
                  />
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <div className="flex gap-2">
                {isGeneric ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      set("outputFields", [...v.outputFields, { key: `value_${v.outputFields.length + 1}`, label: "Value", kind: "text", sensitive: false, copyable: true, path: "" }])
                    }
                  >
                    <PlusIcon /> Add output
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={() => adapter && set("outputFields", adapter.outputFields)}>
                    <RotateCcwIcon /> Reset to adapter defaults
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-6 lg:sticky lg:top-20">
        <Card>
          <CardHeader>
            <CardTitle>Form preview</CardTitle>
            <CardDescription>Rendered from the definition, as users will see it.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormPreview value={{ ...v, durationOptions: parsedDurations }} />
          </CardContent>
        </Card>
        {canEdit ? (
          <Button size="lg" onClick={submit} disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
            {mode === "create" ? "Create protocol" : "Save protocol"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
