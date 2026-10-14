"use client";

import { useState } from "react";
import { KeyRoundIcon, Link2Icon, LoaderCircleIcon, PlugZapIcon, SaveIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/admin/form-field";
import { REGIONS } from "@/lib/countries";
import { slugify } from "@/lib/slug";
import type { ActionState } from "@/lib/action-state";
import { useServerAction } from "@/hooks/use-server-action";

export interface ServerFormValues {
  name?: string;
  /** Public URL name ("de1"); blank on create = next free <country><n>. */
  slug?: string;
  countryCode?: string;
  city?: string | null;
  region?: string | null;
  provider?: string | null;
  hostname?: string;
  ipAddress?: string;
  apiPort?: number;
  apiBasePath?: string;
  maxAccounts?: number;
  notes?: string | null;
  driver?: string;
}

export interface ConnectionFormValues {
  authMethod?: "hmac_sha256" | "bearer_token";
  keyId?: string | null;
  tlsMode?: "system_ca" | "custom_ca" | "pinned_fingerprint" | "insecure_http";
  tlsServerName?: string | null;
  caCertificatePem?: string | null;
  pinnedFingerprintSha256?: string | null;
  clientCertificatePem?: string | null;
  hasClientKey?: boolean;
}

type Errors = ActionState["fieldErrors"];

type Country = { code: string; name: string };

/** "de1"-style URL name: lowercase letters, digits and hyphens (mirrors SERVER_SLUG_PATTERN). */
const cleanSlug = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+/, "")
    .slice(0, 32);

/** URL name with a live preview of the public address it produces. */
function SlugField({ value, onChange, country, editing, current, errors }: {
  value: string;
  onChange: (v: string) => void;
  country: Country | undefined;
  editing: boolean;
  current?: string;
  errors?: string[];
}) {
  const prefix = country ? country.code.toLowerCase() : "de";
  const shown = value || (editing && current ? current : `${prefix}1`);
  const countryPart = country ? slugify(country.name) : "germany";
  return (
    <FormField
      id="slug"
      label="URL name"
      optional={!editing}
      errors={errors}
      className="sm:col-span-2"
      hint={
        editing
          ? "Changing it changes the public links of this server; bookmarks with the old name stop working."
          : `Leave blank to use the next free name for the country, such as ${prefix}1 or ${prefix}2.`
      }
    >
      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
        <Input
          id="slug"
          name="slug"
          value={value}
          onChange={(e) => onChange(cleanSlug(e.target.value))}
          maxLength={32}
          placeholder={editing ? current : `Automatic (${prefix}1…)`}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={!!errors?.length}
          aria-describedby="slug-preview"
        />
        <p id="slug-preview" className="flex min-w-0 items-center gap-1.5 truncate rounded-md border border-dashed bg-muted/40 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          <Link2Icon className="size-3.5 shrink-0" />
          <span className="truncate">
            /&lt;protocol&gt;/{countryPart}/<span className={value ? "font-semibold text-foreground" : undefined}>{shown}</span>
          </span>
        </p>
      </div>
    </FormField>
  );
}

/** Country names are computed on the server and passed in, so SSR and hydration render identical text. */
function DetailsFields({
  v,
  errors,
  drivers,
  countries,
  editing = false,
}: {
  v: ServerFormValues;
  errors: Errors;
  drivers: { key: string; label: string }[];
  countries: Country[];
  editing?: boolean;
}) {
  const [countryCode, setCountryCode] = useState(v.countryCode ?? "");
  const [slug, setSlug] = useState(v.slug ?? "");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="name" label="Server name" errors={errors?.name} hint="Shown to users, e.g. Singapore 01">
        <Input id="name" name="name" defaultValue={v.name} required maxLength={64} placeholder="Singapore 01" aria-invalid={!!errors?.name} />
      </FormField>
      <FormField id="countryCode" label="Country" errors={errors?.countryCode}>
        <NativeSelect
          id="countryCode"
          name="countryCode"
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          required
          aria-invalid={!!errors?.countryCode}
        >
          <option value="" disabled>
            Select a country
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <SlugField
        value={slug}
        onChange={setSlug}
        country={countries.find((c) => c.code === countryCode)}
        editing={editing}
        current={v.slug}
        errors={errors?.slug}
      />
      <FormField id="city" label="City" optional errors={errors?.city}>
        <Input id="city" name="city" defaultValue={v.city ?? ""} maxLength={64} placeholder="Singapore" />
      </FormField>
      <FormField id="region" label="Region" optional errors={errors?.region}>
        <Input id="region" name="region" list="regions" defaultValue={v.region ?? ""} maxLength={64} placeholder="Asia" />
        <datalist id="regions">
          {REGIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </FormField>
      <FormField id="hostname" label="Public hostname" errors={errors?.hostname} hint="Used in client configs and for TLS verification.">
        <Input id="hostname" name="hostname" defaultValue={v.hostname} required placeholder="sg01.example.com" autoCapitalize="none" spellCheck={false} />
      </FormField>
      <FormField id="ipAddress" label="Server IP" errors={errors?.ipAddress} hint="The website always connects to this IP.">
        <Input id="ipAddress" name="ipAddress" defaultValue={v.ipAddress} required placeholder="123.123.123.123" spellCheck={false} />
      </FormField>
      <FormField id="maxAccounts" label="Maximum accounts" errors={errors?.maxAccounts}>
        <Input id="maxAccounts" name="maxAccounts" type="number" min={1} max={100000} defaultValue={v.maxAccounts ?? 100} required />
      </FormField>
      <FormField id="provider" label="Server provider" optional errors={errors?.provider}>
        <Input id="provider" name="provider" defaultValue={v.provider ?? ""} maxLength={64} placeholder="e.g. DigitalOcean" />
      </FormField>
      <FormField id="apiPort" label="Management API port" errors={errors?.apiPort}>
        <Input id="apiPort" name="apiPort" type="number" min={1} max={65535} defaultValue={v.apiPort ?? 8443} required />
      </FormField>
      <FormField id="apiBasePath" label="API base path" errors={errors?.apiBasePath} hint="Prefix of the provisioning API on the server.">
        <Input id="apiBasePath" name="apiBasePath" defaultValue={v.apiBasePath ?? "/api/v1"} required spellCheck={false} />
      </FormField>
      <FormField id="driver" label="Server driver" errors={errors?.driver} hint="How the website talks to this server's provisioning service.">
        <NativeSelect id="driver" name="driver" defaultValue={v.driver ?? drivers[0]?.key}>
          {drivers.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="notes" label="Notes" optional errors={errors?.notes} className="sm:col-span-2">
        <Textarea id="notes" name="notes" defaultValue={v.notes ?? ""} maxLength={2000} rows={2} placeholder="Internal notes (never shown publicly)" />
      </FormField>
    </div>
  );
}

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ConnectionFields({ v, errors, editing }: { v: ConnectionFormValues; errors: Errors; editing: boolean }) {
  const [authMethod, setAuthMethod] = useState(v.authMethod ?? "hmac_sha256");
  const [tlsMode, setTlsMode] = useState(v.tlsMode ?? "system_ca");
  const [secret, setSecret] = useState("");
  const [showMtls, setShowMtls] = useState(!!v.clientCertificatePem);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id="authMethod" label="Authentication method" errors={errors?.authMethod}>
        <NativeSelect id="authMethod" name="authMethod" value={authMethod} onChange={(e) => setAuthMethod(e.target.value as typeof authMethod)}>
          <option value="hmac_sha256">HMAC-signed requests (recommended)</option>
          <option value="bearer_token">Bearer API token</option>
        </NativeSelect>
      </FormField>
      <FormField
        id="keyId"
        label="Key ID"
        optional={authMethod !== "hmac_sha256"}
        errors={errors?.keyId}
        hint="Identifier the server uses to look up this secret (sent as X-Node-Key-Id)."
      >
        <Input id="keyId" name="keyId" defaultValue={v.keyId ?? ""} maxLength={64} placeholder="website-1" spellCheck={false} />
      </FormField>
      <FormField
        id="apiSecret"
        label={authMethod === "hmac_sha256" ? "API secret" : "API token"}
        errors={errors?.apiSecret}
        className="sm:col-span-2"
        hint={
          editing
            ? "Leave blank to keep the current secret. Entering a new one rotates it immediately."
            : "Unique per server. Stored encrypted and never shown again."
        }
      >
        <div className="flex gap-2">
          <Input
            id="apiSecret"
            name="apiSecret"
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required={!editing}
            placeholder={editing ? "•••••••••••• (unchanged)" : "Paste the secret configured on the server"}
            spellCheck={false}
            className="font-mono"
          />
          <Button type="button" variant="outline" onClick={() => setSecret(randomSecret())} title="Generate a random secret">
            <KeyRoundIcon /> Generate
          </Button>
        </div>
      </FormField>
      <FormField id="tlsMode" label="TLS verification" errors={errors?.tlsMode}>
        <NativeSelect id="tlsMode" name="tlsMode" value={tlsMode} onChange={(e) => setTlsMode(e.target.value as typeof tlsMode)}>
          <option value="system_ca">HTTPS — public certificate (e.g. Let&apos;s Encrypt)</option>
          <option value="custom_ca">HTTPS — custom / self-signed CA</option>
          <option value="pinned_fingerprint">HTTPS — pinned certificate fingerprint</option>
          <option value="insecure_http">Plain HTTP (development only)</option>
        </NativeSelect>
      </FormField>
      <FormField id="tlsServerName" label="TLS server name" optional errors={errors?.tlsServerName} hint="Override SNI / certificate name if it differs from the hostname.">
        <Input id="tlsServerName" name="tlsServerName" defaultValue={v.tlsServerName ?? ""} spellCheck={false} />
      </FormField>
      {tlsMode === "custom_ca" ? (
        <FormField id="caCertificatePem" label="CA / server certificate (PEM)" errors={errors?.caCertificatePem} className="sm:col-span-2">
          <Textarea
            id="caCertificatePem"
            name="caCertificatePem"
            defaultValue={v.caCertificatePem ?? ""}
            rows={5}
            className="font-mono text-xs"
            placeholder="-----BEGIN CERTIFICATE-----"
          />
        </FormField>
      ) : null}
      {tlsMode === "pinned_fingerprint" ? (
        <FormField id="pinnedFingerprintSha256" label="Certificate SHA-256 fingerprint" errors={errors?.pinnedFingerprintSha256} className="sm:col-span-2">
          <Input
            id="pinnedFingerprintSha256"
            name="pinnedFingerprintSha256"
            defaultValue={v.pinnedFingerprintSha256 ?? ""}
            className="font-mono text-xs"
            placeholder="AB:CD:…"
            spellCheck={false}
          />
        </FormField>
      ) : null}
      {tlsMode === "insecure_http" ? (
        <Alert variant="warning" className="sm:col-span-2">
          <AlertTitle>Unencrypted management traffic</AlertTitle>
          <AlertDescription>Only for local development or a private network. Production refuses plain HTTP unless explicitly allowed.</AlertDescription>
        </Alert>
      ) : null}
      <div className="sm:col-span-2">
        <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => setShowMtls((s) => !s)}>
          {showMtls ? "Hide" : "Add"} mutual TLS client certificate (optional)
        </button>
      </div>
      {showMtls ? (
        <>
          <FormField id="clientCertificatePem" label="Client certificate (PEM)" optional errors={errors?.clientCertificatePem}>
            <Textarea id="clientCertificatePem" name="clientCertificatePem" defaultValue={v.clientCertificatePem ?? ""} rows={4} className="font-mono text-xs" />
          </FormField>
          <FormField
            id="clientKeyPem"
            label="Client private key (PEM)"
            optional
            errors={errors?.clientKeyPem}
            hint={v.hasClientKey ? "A key is stored. Leave blank to keep it." : "Stored encrypted."}
          >
            <Textarea id="clientKeyPem" name="clientKeyPem" rows={4} className="font-mono text-xs" placeholder={v.hasClientKey ? "(unchanged)" : ""} />
          </FormField>
        </>
      ) : null}
    </div>
  );
}

export function AddServerForm({
  action,
  drivers,
  countries,
}: {
  action: (fd: FormData) => Promise<ActionState>;
  drivers: { key: string; label: string }[];
  countries: Country[];
}) {
  const { state, pending, onSubmit } = useServerAction(action);
  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>Where the server is and how it should appear to users.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailsFields v={{}} errors={state.fieldErrors} drivers={drivers} countries={countries} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Provisioning API</CardTitle>
          <CardDescription>
            Credentials of the provisioning service your installation script set up on this server. Every server must have its own secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionFields v={{}} errors={state.fieldErrors} editing={false} />
        </CardContent>
      </Card>
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          The server is saved as a private draft, then the website connects to it and detects its protocols. Nothing is published yet.
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <PlugZapIcon />}
          {pending ? "Connecting…" : "Connect server"}
        </Button>
      </div>
    </form>
  );
}

export function EditDetailsForm({
  action,
  values,
  drivers,
  countries,
}: {
  action: (fd: FormData) => Promise<ActionState>;
  values: ServerFormValues;
  drivers: { key: string; label: string }[];
  countries: Country[];
}) {
  const { state, pending, onSubmit } = useServerAction(action);
  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <DetailsFields v={values} errors={state.fieldErrors} drivers={drivers} countries={countries} editing />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
          Save details
        </Button>
      </div>
    </form>
  );
}

export function EditConnectionForm({ action, values }: { action: (fd: FormData) => Promise<ActionState>; values: ConnectionFormValues }) {
  const { state, pending, onSubmit } = useServerAction(action);
  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <ConnectionFields v={values} errors={state.fieldErrors} editing />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
          Save connection
        </Button>
      </div>
    </form>
  );
}
