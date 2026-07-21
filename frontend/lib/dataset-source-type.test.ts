import { describe, expect, it } from "vitest";

import { datasetSourceTypeBadge, datasetVersionSourceBadge, normalizeDatasetSourceType } from "./dataset-source-type";

describe("normalizeDatasetSourceType", () => {
  it("maps legacy import literals", () => {
    expect(normalizeDatasetSourceType("csv_import")).toBe("import");
    expect(normalizeDatasetSourceType("manual_upload")).toBe("import");
  });

  it("maps runtime literals", () => {
    expect(normalizeDatasetSourceType("runtime_feedback")).toBe("runtime_accumulated");
    expect(normalizeDatasetSourceType("runtime_accumulation")).toBe("runtime_accumulated");
  });

  it("returns unknown for unrecognized storage strings", () => {
    expect(normalizeDatasetSourceType("custom_vendor_tag")).toBe("unknown");
  });
});

describe("datasetSourceTypeBadge", () => {
  it("includes raw suffix for unknown literals", () => {
    const b = datasetSourceTypeBadge("custom_vendor_tag");
    expect(b.label).toContain("CUSTOM");
  });
});

describe("datasetVersionSourceBadge", () => {
  it("prefers canonical_source_type from API", () => {
    const b = datasetVersionSourceBadge({ source_type: "weird_x", canonical_source_type: "import" });
    expect(b.label).toContain("IMPORT");
  });
});
