# Day 6 Integration Report

Date: 2026-04-25

## Scope

- Integrate one real application-style pipeline using adapter plugin (`app_train_adapter` / `app_etl_adapter`).
- Validate end-to-end run, retry, replay, and lightweight chaos behavior.
- Compare baseline "old flow" plugin execution against MLAir orchestration flow.

## Validation Command

```bash
make day6-check
```

## Result Summary

- Status: PASS
- Old flow runtime (direct plugin execution): `0.0192s`
- MLAir runtime (full orchestrated run): `11.1449s`
- Retry behavior: PASS (attempt > 1 observed)
- Replay behavior: PASS (replay run succeeded)
- Chaos test (stop/start executor): PASS
- Simulated fail run (`always_fail_pipeline`): PASS

## Run References

- Training run: `671474ee-5af0-40ca-9c6d-45d31e920609`
- Replay run: `09df24f6-ae87-4fc6-9049-a4796e4cb33a`
- ETL run (chaos test): `44a2f99a-3c01-4028-a297-cfaf34b77783`
- Failure simulation run: `6f6179de-a3b3-47f7-9752-b0578c3c1f88`

## Comparison Table

| Metric     | Old flow                  | MLAir                               |
| ---------- | ------------------------- | ----------------------------------- |
| Runtime    | 0.0192s                   | 11.1449s                            |
| Retry      | Manual / external         | Built-in scheduler retry (observed) |
| Debug time | Manual log plumbing       | Unified run logs + task telemetry   |
