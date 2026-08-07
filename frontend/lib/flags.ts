function flag(envVar: string | undefined): boolean {
  return envVar === "true";
}

export const flags = {
  exportXlsx: flag(process.env.NEXT_PUBLIC_FEATURE_EXPORT_XLSX),
  exportCsv: flag(process.env.NEXT_PUBLIC_FEATURE_EXPORT_CSV),
};
