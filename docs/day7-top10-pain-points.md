# Day 7 Top 10 Pain Points

1. CLI currently ships as a single script (`mlair`), not a packaged installable tool.
2. CLI has no `plugins list` command yet (requested in Phase 4 DX vision).
3. `mlair run` supports JSON/YAML but has limited schema validation feedback.
4. Quickstart path includes many optional checks; a strict "happy path" doc can be shorter.
5. Some smoke checks are API-heavy and can feel slow on low-resource laptops.
6. Replay behavior is clear, but replay policy errors can use friendlier user-facing messages.
7. Run/task comparison view for "old vs MLAir" is still report-based, not native in UI.
8. Plugin adapter examples exist, but plugin packaging/bootstrap can be simplified further.
9. CI quickstart job runtime can grow due to full container rebuild and image pulls.
10. OSS metadata completeness still needs final polish (`LICENSE`, `CHANGELOG`, templates).
