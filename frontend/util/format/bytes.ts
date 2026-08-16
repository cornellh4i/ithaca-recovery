/**
 * Human-readable byte size (e.g. "4.2 MB", "512 KB", "1.03 GB"). Shared by every Backups
 * admin tab card so the same size reads identically across Backup Health and Snapshots.
 * @param bytes - Raw byte count.
 * @returns A size string with one of B/KB/MB/GB units.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
