import { describe, expect, it, beforeEach } from "vitest";

import {
  envelopeSequence,
  readLastSequence,
  scopeSequenceKey,
  writeLastSequence,
} from "./execution-sequence";

describe("execution-sequence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("scopeSequenceKey joins tenant and project", () => {
    expect(scopeSequenceKey("t1", "p1")).toBe("t1::p1");
  });

  it("persists and reads last sequence per scope", () => {
    writeLastSequence("t1", "p1", 99);
    expect(readLastSequence("t1", "p1")).toBe(99);
    expect(readLastSequence("t2", "p1")).toBe(0);
  });

  it("envelopeSequence returns positive integers only", () => {
    expect(envelopeSequence({ sequence: 5 })).toBe(5);
    expect(envelopeSequence({ sequence: 0 })).toBeUndefined();
    expect(envelopeSequence({})).toBeUndefined();
  });
});
