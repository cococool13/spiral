export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  // Roll over on the *rounded* value, not the raw one: a raw value like
  // 1023.95 stays under the raw 1024 threshold but still rounds to "1024"
  // in its unit, which must land in the next unit instead of displaying
  // "1024 KB". Only the >=10 (whole-number) range can ever approach 1024,
  // so Math.round matches what the final line below would actually show.
  while (unit < units.length - 1 && Math.round(value) >= 1024) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
