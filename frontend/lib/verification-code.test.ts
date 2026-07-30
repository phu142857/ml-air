import { describe, expect, it } from "vitest";

import {
  filterVerificationValue,
  isAllowedVerificationChar,
  sanitizeVerificationPaste,
  verificationInputMode,
  verificationPattern,
} from "./verification-code";

describe("verification-code helpers", () => {
  describe("numeric mode", () => {
    it("accepts digits only", () => {
      expect(isAllowedVerificationChar("1", "numeric")).toBe(true);
      expect(isAllowedVerificationChar("a", "numeric")).toBe(false);
      expect(isAllowedVerificationChar("-", "numeric")).toBe(false);
    });

    it("filters typed value to digits and length", () => {
      expect(filterVerificationValue("12a34b56", "numeric", 6)).toBe("123456");
      expect(filterVerificationValue("123456789", "numeric", 6)).toBe("123456");
    });

    it("sanitizes paste by keeping digits only", () => {
      expect(sanitizeVerificationPaste("123456", "numeric")).toBe("123456");
      expect(sanitizeVerificationPaste("12 34-56", "numeric")).toBe("123456");
      expect(sanitizeVerificationPaste("12ab34", "numeric")).toBe("1234");
    });

    it("uses numeric keyboard / digit pattern", () => {
      expect(verificationInputMode("numeric")).toBe("numeric");
      expect(verificationPattern("numeric")).toBe("^\\d+$");
    });
  });

  describe("alphanumeric recovery mode", () => {
    it("accepts letters and digits", () => {
      expect(isAllowedVerificationChar("A", "alphanumeric")).toBe(true);
      expect(isAllowedVerificationChar("7", "alphanumeric")).toBe(true);
      expect(isAllowedVerificationChar("-", "alphanumeric")).toBe(false);
      expect(isAllowedVerificationChar("@", "alphanumeric")).toBe(false);
    });

    it("uppercases and truncates to length", () => {
      expect(filterVerificationValue("ab7k2m9x", "alphanumeric", 8)).toBe("AB7K2M9X");
      expect(filterVerificationValue("ab7k-2m9x", "alphanumeric", 8)).toBe("AB7K2M9X");
    });

    it("strips only the known recovery separator on paste", () => {
      expect(sanitizeVerificationPaste("AB7K2M9X", "alphanumeric")).toBe("AB7K2M9X");
      expect(sanitizeVerificationPaste("AB7K-2M9X", "alphanumeric")).toBe("AB7K2M9X");
      // Unknown symbols are preserved for the pattern layer (not silently rewritten).
      expect(sanitizeVerificationPaste("AB7K@2M9", "alphanumeric")).toBe("AB7K@2M9");
    });

    it("uses text keyboard / alphanumeric pattern", () => {
      expect(verificationInputMode("alphanumeric")).toBe("text");
      expect(verificationPattern("alphanumeric")).toBe("^[a-zA-Z0-9]+$");
    });
  });

  describe("round-trip paste into filtered value", () => {
    it("distributes a full OTP paste", () => {
      const pasted = sanitizeVerificationPaste("123456", "numeric");
      expect(filterVerificationValue(pasted, "numeric", 6)).toBe("123456");
    });

    it("distributes a partial OTP paste", () => {
      const pasted = sanitizeVerificationPaste("12x34", "numeric");
      expect(filterVerificationValue(pasted, "numeric", 6)).toBe("1234");
    });

    it("distributes recovery paste with separator", () => {
      const pasted = sanitizeVerificationPaste("abcd-1234", "alphanumeric");
      expect(filterVerificationValue(pasted, "alphanumeric", 8)).toBe("ABCD1234");
    });

    it("uses only the required length from an oversized paste", () => {
      const pasted = sanitizeVerificationPaste("1234567890", "numeric");
      expect(filterVerificationValue(pasted, "numeric", 6)).toBe("123456");
    });
  });
});
