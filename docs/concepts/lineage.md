# Lineage

**Lineage** links dataset versions, runs, and model versions so operators can answer “what produced this?” and “what did this train on?”.

## What it is

- Edges stored and queried under project scope (`/lineage`, neighborhood, run slice, ingest).
- Hub **Lineage** graph (React Flow) with deep-links from run / dataset context.
- Complements immutable **dataset versions** and model provenance.

## When to use

- Audit training provenance before promote.
- Trace downstream impact of a dataset version or run failure.

## Related

- Guides: [Track Lineage](../guides/track-lineage.md), [View Lineage Graph](../guides/view-lineage-graph.md), [Explore Lineage in UI](../guides/explore-lineage.md)
- Concepts: [Run](./run.md), [Lifecycle formal model](./lifecycle-formal-model.md)
