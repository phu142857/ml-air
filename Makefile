SHELL := /bin/bash

ML_AIR_BASE_URL ?= http://localhost:8080
ML_AIR_TENANT_ID ?= default
ML_AIR_PROJECT_ID ?= default_project
COMPOSE_FILE ?= deploy/docker-compose.quickstart.yml

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

.PHONY: test-all
test-all: test-smoke-mlair test-helm
