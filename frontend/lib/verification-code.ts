export type VerificationCodeMode = "numeric" | "alphanumeric";

/** Display separator used by MLAir recovery codes (`XXXX-XXXX`). */
export const RECOVERY_CODE_SEPARATOR = "-";

const NUMERIC_CHAR = /^\d$/;
const ALPHANUMERIC_CHAR = /^[a-zA-Z0-9]$/;

export function isAllowedVerificationChar(char: string, mode: VerificationCodeMode): boolean {
  if (char.length !== 1) return false;
  return mode === "numeric" ? NUMERIC_CHAR.test(char) : ALPHANUMERIC_CHAR.test(char);
}

/**
 * Normalize a pasted verification string before distributing into cells.
 * Recovery mode only strips the known `-` separator; other characters are left for
 * pattern filtering so we do not invent additional recovery-code formats.
 */
export function sanitizeVerificationPaste(pasted: string, mode: VerificationCodeMode): string {
  const raw = String(pasted ?? "");
  if (mode === "numeric") {
    return raw.replace(/\D/g, "");
  }
  return raw.split(RECOVERY_CODE_SEPARATOR).join("");
}

/** Keep only characters allowed for the mode, optionally uppercasing alphanumeric. */
export function filterVerificationValue(
  value: string,
  mode: VerificationCodeMode,
  length: number,
  options?: { uppercaseAlphanumeric?: boolean },
): string {
  const uppercase = options?.uppercaseAlphanumeric ?? mode === "alphanumeric";
  let out = "";
  for (const ch of value) {
    if (!isAllowedVerificationChar(ch, mode)) continue;
    out += mode === "alphanumeric" && uppercase ? ch.toUpperCase() : ch;
    if (out.length >= length) break;
  }
  return out;
}

export function verificationInputMode(mode: VerificationCodeMode): "numeric" | "text" {
  return mode === "numeric" ? "numeric" : "text";
}

export function verificationPattern(mode: VerificationCodeMode): string {
  return mode === "numeric" ? "^\\d+$" : "^[a-zA-Z0-9]+$";
}
