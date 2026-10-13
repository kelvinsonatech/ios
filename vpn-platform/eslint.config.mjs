import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "dist/**", "node_modules/**", "drizzle/**", "next-env.d.ts"],
  },
  {
    // Server-only modules must never be imported from client components.
    files: ["src/components/**/*.tsx", "src/app/**/*-client.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/*"], message: "Client code must not import server modules." }] },
      ],
    },
  },
];

export default config;
