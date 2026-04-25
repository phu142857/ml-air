SHELL := /bin/bash

ML_AIR_BASE_URL ?= http://localhost:8080
ML_AIR_TENANT_ID ?= default
ML_AIR_PROJECT_ID ?= default_project
COMPOSE_FILE ?= deploy/docker-compose.quickstart.yml
BACKUP_DIR ?= backups/postgres
BACKUP_FILE ?=

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
test-all: test-env-sync test-smoke-mlair test-smoke-model-registry test-smoke-phase2 test-smoke-v03 test-observability test-helm

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
