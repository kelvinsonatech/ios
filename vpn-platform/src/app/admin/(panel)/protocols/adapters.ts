import { getAdapter, listAdapters } from "@/server/provisioning/adapters/registry";
import type { AdapterInfo } from "./protocol-editor";

export function adapterInfos(): AdapterInfo[] {
  return listAdapters().map((a) => {
    const full = getAdapter(a.key);
    return {
      key: a.key,
      label: a.label,
      description: a.description,
      requiredInputs: a.requiredInputs,
      outputFields: full.outputFields,
      defaultFields: full.defaultFields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder ?? null,
        helpText: f.helpText ?? null,
        options: f.options,
        validation: f.validation,
        defaultValue: f.defaultValue ?? null,
      })),
    };
  });
}
