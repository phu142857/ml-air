import { describe, expect, it } from "vitest";
import { parsePipelineText } from "./parse";
import { configToPreviewPipeline, normalizePipelineConfig } from "./normalize";
import { clientValidatePipelineConfig, unknownRegistryPlugins } from "./validate";

const SAMPLE = `
inputs:
  - dataset: demo
    required_size: 10
tasks:
  - id: a
    plugin: p1
  - id: b
    plugin: p2
    depends_on: [a]
`;

describe("pipeline parse + normalize", () => {
  it("parses yaml tasks and inputs", () => {
    const parsed = parsePipelineText(SAMPLE, "yaml");
    expect(parsed.config.tasks).toHaveLength(2);
    expect(parsed.config.tasks[1].depends_on).toEqual(["a"]);
    expect(parsed.config.inputs?.[0]?.dataset).toBe("demo");
  });

  it("parses bundle manifest shape", () => {
    const parsed = parsePipelineText(
      `pipeline_id: my_pipe\nconfig:\n  tasks:\n    - id: train\n      plugin: echo_tracking`,
      "yaml",
    );
    expect(parsed.manifestPipelineId).toBe("my_pipe");
    expect(parsed.config.tasks[0].plugin).toBe("echo_tracking");
  });
});

describe("clientValidatePipelineConfig", () => {
  it("passes valid dag", () => {
    const config = normalizePipelineConfig({
      tasks: [
        { id: "a", plugin: "p1" },
        { id: "b", plugin: "p2", depends_on: ["a"] },
      ],
    });
    expect(clientValidatePipelineConfig(config).ok).toBe(true);
  });

  it("detects duplicate ids and cycles", () => {
    const dup = clientValidatePipelineConfig(
      normalizePipelineConfig({
        tasks: [
          { id: "a", plugin: "p1" },
          { id: "a", plugin: "p2" },
        ],
      }),
    );
    expect(dup.ok).toBe(false);

    const cycle = clientValidatePipelineConfig(
      normalizePipelineConfig({
        tasks: [
          { id: "a", plugin: "p1", depends_on: ["b"] },
          { id: "b", plugin: "p2", depends_on: ["a"] },
        ],
      }),
    );
    expect(cycle.ok).toBe(false);
    expect(cycle.errors.some((e) => e.code === "CYCLE")).toBe(true);
  });
});

describe("unknownRegistryPlugins", () => {
  it("lists plugins not in registry", () => {
    const config = normalizePipelineConfig({
      tasks: [
        { id: "a", plugin: "echo_tracking" },
        { id: "b", plugin: "vetai_train" },
      ],
    });
    const unknown = unknownRegistryPlugins(config, new Set(["echo_tracking"]));
    expect(unknown).toEqual(["vetai_train"]);
  });
});

describe("configToPreviewPipeline", () => {
  it("builds stages for dag preview", () => {
    const config = normalizePipelineConfig({
      tasks: [{ id: "train", plugin: "cv_yolo_train", depends_on: ["prep"] }, { id: "prep", plugin: "cv_yolo_prepare" }],
    });
    const pipeline = configToPreviewPipeline("demo", config);
    expect(pipeline.stages).toHaveLength(2);
    expect(pipeline.stages.find((s) => s.id === "train")?.dependencies).toEqual(["prep"]);
  });
});
