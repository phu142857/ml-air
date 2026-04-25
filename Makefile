SHELL := /bin/bash
-include .env

ML_AIR_BASE_URL ?= http://localhost:8080
ML_AIR_TENANT_ID ?= default
ML_AIR_PROJECT_ID ?= default_project
COMPOSE_FILE ?= deploy/docker-compose.quickstart.yml
BACKUP_DIR ?= backups/postgres
BACKUP_FILE ?=
BACKFILL_LIMIT ?= 1000
BACKFILL_OFFSET ?= 0
BACKFILL_TENANT_ID ?=
BACKFILL_PROJECT_ID ?=
BACKFILL_REPORT_PATH ?=
MANIFEST_KEYS_LOCAL_FILE ?= deploy/security/manifest-keys.local.json
MANIFEST_KEYS_SAMPLE_FILE ?= deploy/security/manifest-keys.sample.json
MANIFEST_KEYS_FILE ?= $(if $(ML_AIR_MANIFEST_MANAGED_KEYS_FILE),$(ML_AIR_MANIFEST_MANAGED_KEYS_FILE),$(if $(wildcard $(MANIFEST_KEYS_LOCAL_FILE)),$(MANIFEST_KEYS_LOCAL_FILE),$(MANIFEST_KEYS_SAMPLE_FILE)))

BACKFILL_ARGS = --limit $(BACKFILL_LIMIT) --offset $(BACKFILL_OFFSET)
ifneq ($(strip $(BACKFILL_TENANT_ID)),)
BACKFILL_ARGS += --tenant-id $(BACKFILL_TENANT_ID)
endif
ifneq ($(strip $(BACKFILL_PROJECT_ID)),)
BACKFILL_ARGS += --project-id $(BACKFILL_PROJECT_ID)
endif

.PHONY: build
build:
	docker compose -f $(COMPOSE_FILE) build

.PHONY: up
up:
	docker compose -f $(COMPOSE_FILE) up -d

.PHONY: down
down:
	docker compose -f $(COMPOSE_FILE) down

.PHONY: rebuild
rebuild:
	docker compose -f $(COMPOSE_FILE) up -d --build

.PHONY: test-smoke-mlair
test-smoke-mlair:
	ML_AIR_BASE_URL=$(ML_AIR_BASE_URL) \
	ML_AIR_TENANT_ID=$(ML_AIR_TENANT_ID) \
	ML_AIR_PROJECT_ID=$(ML_AIR_PROJECT_ID) \
	python scripts/test_smoke_mlair.py

.PHONY: test-helm
test-helm:
	helm lint charts/ml-air
	helm template ml-air charts/ml-air -f charts/ml-air/values-staging.yaml >/tmp/mlair-rendered.yaml
	python scripts/check_deploy_config.py

.PHONY: test-env-sync
test-env-sync:
	python scripts/check_env_sync.py

.PHONY: test-manifest-key-rotation
test-manifest-key-rotation:
	@if [ ! -f "$(MANIFEST_KEYS_FILE)" ]; then \
		echo "[FAIL] Managed key file not found: $(MANIFEST_KEYS_FILE)"; \
		exit 1; \
	fi
	ML_AIR_MANIFEST_SIGNING_KEY="$(ML_AIR_MANIFEST_SIGNING_KEY)" \
	ML_AIR_MANIFEST_ED25519_PRIVATE_KEY="$(ML_AIR_MANIFEST_ED25519_PRIVATE_KEY)" \
	ML_AIR_MANIFEST_ED25519_PUBLIC_KEY="$(ML_AIR_MANIFEST_ED25519_PUBLIC_KEY)" \
	python scripts/check_manifest_key_rotation.py --file $(MANIFEST_KEYS_FILE) --algorithm hmac-sha256

.PHONY: init-manifest-keys-local
init-manifest-keys-local:
	@if [ -f "$(MANIFEST_KEYS_LOCAL_FILE)" ]; then \
		echo "Local key file already exists: $(MANIFEST_KEYS_LOCAL_FILE)"; \
	else \
		cp "$(MANIFEST_KEYS_SAMPLE_FILE)" "$(MANIFEST_KEYS_LOCAL_FILE)"; \
		echo "Created local key file: $(MANIFEST_KEYS_LOCAL_FILE)"; \
		echo "IMPORTANT: replace placeholder key values before use."; \
	fi

.PHONY: gen-ed25519-env
gen-ed25519-env:
	python scripts/generate_ed25519_env.py --kid v1

.PHONY: enable-ed25519-dev
enable-ed25519-dev:
	python scripts/generate_ed25519_env.py --kid v1 --write-env --env-path .env

.PHONY: test-smoke-model-registry
test-smoke-model-registry:
	ML_AIR_BASE_URL=$(ML_AIR_BASE_URL) \
	ML_AIR_TENANT_ID=$(ML_AIR_TENANT_ID) \
	ML_AIR_PROJECT_ID=$(ML_AIR_PROJECT_ID) \
	python scripts/test_smoke_model_registry.py

.PHONY: test-smoke-phase2
test-smoke-phase2:
	ML_AIR_BASE_URL=$(ML_AIR_BASE_URL) \
	ML_AIR_TENANT_ID=$(ML_AIR_TENANT_ID) \
	ML_AIR_PROJECT_ID=$(ML_AIR_PROJECT_ID) \
	python scripts/test_smoke_phase2.py

.PHONY: test-smoke-v03
test-smoke-v03:
	ML_AIR_BASE_URL=$(ML_AIR_BASE_URL) \
	ML_AIR_TENANT=$(ML_AIR_TENANT_ID) \
	ML_AIR_PROJECT=$(ML_AIR_PROJECT_ID) \
	ML_AIR_TOKEN=$${ML_AIR_TOKEN:-maintainer-token} \
	python scripts/test_smoke_v03.py

.PHONY: backfill-lineage
backfill-lineage:
	docker compose -f $(COMPOSE_FILE) up -d --build api
	docker compose -f $(COMPOSE_FILE) exec -T api python scripts/backfill_lineage_from_manifests.py $(BACKFILL_ARGS)

.PHONY: backfill-lineage-dry-run
backfill-lineage-dry-run:
	docker compose -f $(COMPOSE_FILE) up -d --build api
	docker compose -f $(COMPOSE_FILE) exec -T api python scripts/backfill_lineage_from_manifests.py $(BACKFILL_ARGS) --dry-run

.PHONY: backfill-lineage-all
backfill-lineage-all:
	docker compose -f $(COMPOSE_FILE) up -d --build api
	@offset=$(BACKFILL_OFFSET); \
	while true; do \
		echo "==> backfill batch offset=$$offset limit=$(BACKFILL_LIMIT)"; \
		out="$$(docker compose -f $(COMPOSE_FILE) exec -T api python scripts/backfill_lineage_from_manifests.py --limit $(BACKFILL_LIMIT) --offset $$offset $$( [ -n "$(BACKFILL_TENANT_ID)" ] && printf '%s %s' '--tenant-id' '$(BACKFILL_TENANT_ID)' ) $$( [ -n "$(BACKFILL_PROJECT_ID)" ] && printf '%s %s' '--project-id' '$(BACKFILL_PROJECT_ID)' ))"; \
		printf '%s\n' "$$out"; \
		scanned="$$(printf '%s\n' "$$out" | python -c 'import json,re,sys; t=sys.stdin.read(); m=re.findall(r"\{[^{}]*\}", t); print(int(json.loads(m[-1]).get("scanned", 0)) if m else 0)')"; \
		if [ "$$scanned" -lt "$(BACKFILL_LIMIT)" ]; then \
			echo "==> done (last batch scanned=$$scanned)"; \
			break; \
		fi; \
		offset=$$((offset + $(BACKFILL_LIMIT))); \
	done

.PHONY: backfill-lineage-all-dry-run
backfill-lineage-all-dry-run:
	docker compose -f $(COMPOSE_FILE) up -d --build api
	@offset=$(BACKFILL_OFFSET); \
	while true; do \
		echo "==> dry-run batch offset=$$offset limit=$(BACKFILL_LIMIT)"; \
		out="$$(docker compose -f $(COMPOSE_FILE) exec -T api python scripts/backfill_lineage_from_manifests.py --limit $(BACKFILL_LIMIT) --offset $$offset --dry-run $$( [ -n "$(BACKFILL_TENANT_ID)" ] && printf '%s %s' '--tenant-id' '$(BACKFILL_TENANT_ID)' ) $$( [ -n "$(BACKFILL_PROJECT_ID)" ] && printf '%s %s' '--project-id' '$(BACKFILL_PROJECT_ID)' ))"; \
		printf '%s\n' "$$out"; \
		scanned="$$(printf '%s\n' "$$out" | python -c 'import json,re,sys; t=sys.stdin.read(); m=re.findall(r"\{[^{}]*\}", t); print(int(json.loads(m[-1]).get("scanned", 0)) if m else 0)')"; \
		if [ "$$scanned" -lt "$(BACKFILL_LIMIT)" ]; then \
			echo "==> done (last batch scanned=$$scanned)"; \
			break; \
		fi; \
		offset=$$((offset + $(BACKFILL_LIMIT))); \
	done

.PHONY: backfill-lineage-report
backfill-lineage-report:
	docker compose -f $(COMPOSE_FILE) up -d --build api
	@offset=$(BACKFILL_OFFSET); \
	total_scanned=0; total_with_lineage=0; total_inserted=0; total_failures=0; total_skipped_empty=0; total_skipped_invalid=0; batches=0; \
	while true; do \
		echo "==> report batch offset=$$offset limit=$(BACKFILL_LIMIT)"; \
		out="$$(docker compose -f $(COMPOSE_FILE) exec -T api python scripts/backfill_lineage_from_manifests.py --limit $(BACKFILL_LIMIT) --offset $$offset $$( [ -n "$(BACKFILL_TENANT_ID)" ] && printf '%s %s' '--tenant-id' '$(BACKFILL_TENANT_ID)' ) $$( [ -n "$(BACKFILL_PROJECT_ID)" ] && printf '%s %s' '--project-id' '$(BACKFILL_PROJECT_ID)' ))"; \
		printf '%s\n' "$$out"; \
		json_line="$$(printf '%s\n' "$$out" | python -c 'import re,sys; t=sys.stdin.read(); m=re.findall(r"\{[^{}]*\}", t); print(m[-1] if m else "{}")')"; \
		scanned="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("scanned",0)))')"; \
		with_lineage="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("with_lineage",0)))')"; \
		inserted="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("inserted_edges",0)))')"; \
		failures="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("failures",0)))')"; \
		skipped_empty="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("skipped_empty_lineage",0)))')"; \
		skipped_invalid="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("skipped_invalid_payload",0)))')"; \
		total_scanned=$$((total_scanned + scanned)); \
		total_with_lineage=$$((total_with_lineage + with_lineage)); \
		total_inserted=$$((total_inserted + inserted)); \
		total_failures=$$((total_failures + failures)); \
		total_skipped_empty=$$((total_skipped_empty + skipped_empty)); \
		total_skipped_invalid=$$((total_skipped_invalid + skipped_invalid)); \
		batches=$$((batches + 1)); \
		if [ "$$scanned" -lt "$(BACKFILL_LIMIT)" ]; then \
			echo "==> report done (last batch scanned=$$scanned)"; \
			break; \
		fi; \
		offset=$$((offset + $(BACKFILL_LIMIT))); \
	done; \
	summary="$$(printf '{"mode":"write","batches":%s,"total_scanned":%s,"total_with_lineage":%s,"total_inserted_edges":%s,"total_skipped_empty_lineage":%s,"total_skipped_invalid_payload":%s,"total_failures":%s}\n' \
		"$$batches" "$$total_scanned" "$$total_with_lineage" "$$total_inserted" "$$total_skipped_empty" "$$total_skipped_invalid" "$$total_failures")"; \
	printf '%s\n' "$$summary"; \
	if [ -n "$(BACKFILL_REPORT_PATH)" ]; then \
		mkdir -p "$$(dirname "$(BACKFILL_REPORT_PATH)")"; \
		printf '%s\n' "$$summary" > "$(BACKFILL_REPORT_PATH)"; \
		echo "==> report written to $(BACKFILL_REPORT_PATH)"; \
	fi

.PHONY: backfill-lineage-report-dry-run
backfill-lineage-report-dry-run:
	docker compose -f $(COMPOSE_FILE) up -d --build api
	@offset=$(BACKFILL_OFFSET); \
	total_scanned=0; total_with_lineage=0; total_inserted=0; total_failures=0; total_skipped_empty=0; total_skipped_invalid=0; batches=0; \
	while true; do \
		echo "==> report dry-run batch offset=$$offset limit=$(BACKFILL_LIMIT)"; \
		out="$$(docker compose -f $(COMPOSE_FILE) exec -T api python scripts/backfill_lineage_from_manifests.py --limit $(BACKFILL_LIMIT) --offset $$offset --dry-run $$( [ -n "$(BACKFILL_TENANT_ID)" ] && printf '%s %s' '--tenant-id' '$(BACKFILL_TENANT_ID)' ) $$( [ -n "$(BACKFILL_PROJECT_ID)" ] && printf '%s %s' '--project-id' '$(BACKFILL_PROJECT_ID)' ))"; \
		printf '%s\n' "$$out"; \
		json_line="$$(printf '%s\n' "$$out" | python -c 'import re,sys; t=sys.stdin.read(); m=re.findall(r"\{[^{}]*\}", t); print(m[-1] if m else "{}")')"; \
		scanned="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("scanned",0)))')"; \
		with_lineage="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("with_lineage",0)))')"; \
		inserted="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("inserted_edges",0)))')"; \
		failures="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("failures",0)))')"; \
		skipped_empty="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("skipped_empty_lineage",0)))')"; \
		skipped_invalid="$$(printf '%s\n' "$$json_line" | python -c 'import json,sys; print(int(json.loads(sys.stdin.read()).get("skipped_invalid_payload",0)))')"; \
		total_scanned=$$((total_scanned + scanned)); \
		total_with_lineage=$$((total_with_lineage + with_lineage)); \
		total_inserted=$$((total_inserted + inserted)); \
		total_failures=$$((total_failures + failures)); \
		total_skipped_empty=$$((total_skipped_empty + skipped_empty)); \
		total_skipped_invalid=$$((total_skipped_invalid + skipped_invalid)); \
		batches=$$((batches + 1)); \
		if [ "$$scanned" -lt "$(BACKFILL_LIMIT)" ]; then \
			echo "==> report dry-run done (last batch scanned=$$scanned)"; \
			break; \
		fi; \
		offset=$$((offset + $(BACKFILL_LIMIT))); \
	done; \
	summary="$$(printf '{"mode":"dry-run","batches":%s,"total_scanned":%s,"total_with_lineage":%s,"total_inserted_edges":%s,"total_skipped_empty_lineage":%s,"total_skipped_invalid_payload":%s,"total_failures":%s}\n' \
		"$$batches" "$$total_scanned" "$$total_with_lineage" "$$total_inserted" "$$total_skipped_empty" "$$total_skipped_invalid" "$$total_failures")"; \
	printf '%s\n' "$$summary"; \
	if [ -n "$(BACKFILL_REPORT_PATH)" ]; then \
		mkdir -p "$$(dirname "$(BACKFILL_REPORT_PATH)")"; \
		printf '%s\n' "$$summary" > "$(BACKFILL_REPORT_PATH)"; \
		echo "==> report written to $(BACKFILL_REPORT_PATH)"; \
	fi

.PHONY: test-observability
test-observability:
	ML_AIR_BASE_URL=$(ML_AIR_BASE_URL) \
	ML_AIR_PROMETHEUS_URL=http://localhost:39090 \
	ML_AIR_GRAFANA_URL=http://localhost:33000 \
	bash scripts/check_observability.sh

.PHONY: incident-drill
incident-drill:
	ML_AIR_BASE_URL=$(ML_AIR_BASE_URL) \
	ML_AIR_PROMETHEUS_URL=http://localhost:39090 \
	ML_AIR_TENANT_ID=$(ML_AIR_TENANT_ID) \
	ML_AIR_PROJECT_ID=$(ML_AIR_PROJECT_ID) \
	bash scripts/incident_drill.sh

.PHONY: test-all
test-all: test-env-sync test-manifest-key-rotation test-smoke-mlair test-smoke-model-registry test-smoke-phase2 test-smoke-v03 test-observability test-helm

.PHONY: backup-db
backup-db:
	mkdir -p $(BACKUP_DIR)
	docker compose -f $(COMPOSE_FILE) exec -T postgres pg_dump -U mlair -d mlair -Fc > $(BACKUP_DIR)/mlair_$$(date +%Y%m%d_%H%M%S).dump
	@echo "Backup created in $(BACKUP_DIR)"

.PHONY: restore-db
restore-db:
	@if [ -z "$(BACKUP_FILE)" ]; then echo "BACKUP_FILE is required. Example: make restore-db BACKUP_FILE=backups/postgres/mlair_YYYYMMDD_HHMMSS.dump"; exit 1; fi
	@if [ ! -f "$(BACKUP_FILE)" ]; then echo "Backup file not found: $(BACKUP_FILE)"; exit 1; fi
	docker compose -f $(COMPOSE_FILE) exec -T postgres pg_restore -U mlair -d mlair --clean --if-exists < $(BACKUP_FILE)
	@echo "Restore completed from $(BACKUP_FILE)"
