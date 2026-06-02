import 'i18next';

// Narrow i18next's `t()` return type to `string`.
// Without this, i18next v25 types `t(key, defaultValue)` as a wide union
// (`string | $SpecialObject | TFunctionDetailedResult`) which is not assignable
// to React's `ReactNode`/`ReactI18NextChildren`, forcing `as any` at call sites.
//
// NOTE: We intentionally do NOT provide `resources` here. Supplying the full
// resource map enables strict literal-key checking, which breaks the many
// dynamic/template `t(\`ns.${value}\`)` calls and plain-string key lookups
// throughout the app (hundreds of false-positive errors). Keeping keys as
// loose `string` preserves runtime behavior while still narrowing the return
// type to `string` via `returnNull`/`returnObjects: false`.
declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
    returnObjects: false;
  }
}
