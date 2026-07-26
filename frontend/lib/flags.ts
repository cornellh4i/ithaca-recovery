function flag(envVar: string | undefined): boolean {
  return envVar === "true";
}

export const flags = {
  importTab: flag(process.env.NEXT_PUBLIC_FEATURE_IMPORT_TAB),
  exportXlsx: flag(process.env.NEXT_PUBLIC_FEATURE_EXPORT_XLSX),
  exportCsv: flag(process.env.NEXT_PUBLIC_FEATURE_EXPORT_CSV),
};
