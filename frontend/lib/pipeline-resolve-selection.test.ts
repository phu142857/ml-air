import { describe, expect, it } from "vitest";
import {
  PIPELINE_RESOLVE_AUTO,
  buildPipelineSelectOptions,
  effectivePipelineId,
  pipelineIdOverrideForTrigger,
} from "./pipeline-resolve-selection";

describe("pipeline-resolve-selection", () => {
  it("uses resolved id in auto mode", () => {
    expect(effectivePipelineId(PIPELINE_RESOLVE_AUTO, "demo_pipeline")).toBe("demo_pipeline");
    expect(pipelineIdOverrideForTrigger(PIPELINE_RESOLVE_AUTO, "demo_pipeline")).toBeUndefined();
  });

  it("sends override when user picks another pipeline", () => {
    expect(pipelineIdOverrideForTrigger("other_pipeline", "demo_pipeline")).toBe("other_pipeline");
    expect(effectivePipelineId("other_pipeline", "demo_pipeline")).toBe("other_pipeline");
  });

  it("builds auto-first options when resolved", () => {
    const opts = buildPipelineSelectOptions(
      [{ pipeline_id: "demo_pipeline" }, { pipeline_id: "alt_pipeline" }],
      { pipeline_id: "demo_pipeline", source: "model_pipeline_mapping" },
    );
    expect(opts[0]?.value).toBe(PIPELINE_RESOLVE_AUTO);
    expect(opts.some((o) => o.value === "alt_pipeline")).toBe(true);
    expect(opts.some((o) => o.value === "demo_pipeline" && o.value !== PIPELINE_RESOLVE_AUTO)).toBe(false);
  });

  it("lists all pipelines when unresolved", () => {
    const opts = buildPipelineSelectOptions(
      [{ pipeline_id: "a" }, { pipeline_id: "b" }],
      { pipeline_id: null, source: "unresolved" },
    );
    expect(opts[0]?.label).toContain("Select pipeline");
    expect(opts.filter((o) => o.value === "a" || o.value === "b")).toHaveLength(2);
  });
});
