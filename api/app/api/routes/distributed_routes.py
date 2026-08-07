"""Phase 6 Distributed Control Plane HTTP routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.domains.distributed import cluster_registry_service as cluster_svc
from app.domains.distributed import disaster_recovery_service as dr_svc
from app.domains.distributed import edge_deployment_service as edge_svc
from app.domains.distributed import extension_platform_service as ext_svc
from app.domains.distributed import federation_service as fed_svc
from app.domains.distributed import global_identity_service as identity_svc
from app.domains.distributed import global_observability_service as obs_svc
from app.domains.distributed import global_scheduler_service as sched_svc
from app.domains.distributed import region_registry_service as region_svc
from app.domains.distributed import replication_service as repl_svc
from app.domains.distributed.config import (
    disaster_recovery_enabled,
    edge_deployment_enabled,
    extension_platform_enabled,
    federation_enabled,
    global_identity_enabled,
    global_observability_enabled,
    global_scheduler_enabled,
    multi_cluster_enabled,
    multi_region_enabled,
)
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope

router = APIRouter(tags=["distributed"])


class ClusterRegister(BaseModel):
    region_id: str
    name: str
    api_endpoint: str
    labels: dict[str, Any] = Field(default_factory=dict)
    capacity: dict[str, Any] = Field(default_factory=dict)


class ClusterHeartbeat(BaseModel):
    agent_token: str
    capacity: dict[str, Any] | None = None
    health_status: str = "healthy"


class RegionRegister(BaseModel):
    code: str
    name: str
    preference_weight: float = 1.0
    failover_region_id: str | None = None
    latency_ms_hint: int | None = None


class FederationCreate(BaseModel):
    name: str
    parent_federation_id: str | None = None
    scope: str = "regional"
    config: dict[str, Any] = Field(default_factory=dict)


class FederationAttachRegion(BaseModel):
    region_id: str
    tenant_scope: str | None = None
    policy_scope: dict[str, Any] = Field(default_factory=dict)


class EdgeRegister(BaseModel):
    cluster_id: str
    name: str
    deployment_kind: str = "edge"
    sync_mode: str = "online"
    config: dict[str, Any] = Field(default_factory=dict)


class PlaceRunRequest(BaseModel):
    run_id: str
    tenant_id: str
    project_id: str
    gpu_required: bool = False
    region_preference: str | None = None
    cluster_labels: dict[str, str] = Field(default_factory=dict)
    latency_budget_ms: int | None = None


class ReplicationEnqueue(BaseModel):
    source_region_id: str
    target_region_id: str
    resource_type: str
    resource_id: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ReplicationBundle(BaseModel):
    source_region_id: str
    target_region_id: str
    resources: list[dict[str, str]]


class DrSnapshotCreate(BaseModel):
    scope: str = "global"
    region_id: str | None = None


class TrustCreate(BaseModel):
    source_domain: str
    target_domain: str
    trust_kind: str = "federation"
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ExtensionRegister(BaseModel):
    point_type: str
    name: str
    version: str
    entrypoint: str
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


@router.get("/distributed/clusters")
def list_clusters_v1(
    region_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not multi_cluster_enabled():
        raise HTTPException(status_code=503, detail="multi_cluster_disabled")
    return {"items": cluster_svc.list_clusters(region_id=region_id)}


@router.post("/distributed/clusters")
def register_cluster_v1(
    payload: ClusterRegister,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not multi_cluster_enabled():
        raise HTTPException(status_code=503, detail="multi_cluster_disabled")
    return cluster_svc.register_cluster(
        region_id=payload.region_id,
        name=payload.name,
        api_endpoint=payload.api_endpoint,
        labels=payload.labels,
        capacity=payload.capacity,
    )


@router.get("/distributed/clusters/{cluster_id}")
def get_cluster_v1(cluster_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    cluster = cluster_svc.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="cluster_not_found")
    return cluster


@router.post("/distributed/clusters/{cluster_id}/heartbeat")
def cluster_heartbeat_v1(cluster_id: str, payload: ClusterHeartbeat) -> dict[str, Any]:
    if not multi_cluster_enabled():
        raise HTTPException(status_code=503, detail="multi_cluster_disabled")
    try:
        return cluster_svc.record_heartbeat(
            cluster_id=cluster_id,
            agent_token=payload.agent_token,
            capacity=payload.capacity,
            health_status=payload.health_status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/distributed/clusters/health/summary")
def cluster_health_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return cluster_svc.cluster_health_summary()


@router.get("/distributed/regions")
def list_regions_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not multi_region_enabled():
        raise HTTPException(status_code=503, detail="multi_region_disabled")
    return {"items": region_svc.list_regions()}


@router.post("/distributed/regions")
def register_region_v1(payload: RegionRegister, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not multi_region_enabled():
        raise HTTPException(status_code=503, detail="multi_region_disabled")
    return region_svc.register_region(
        code=payload.code,
        name=payload.name,
        preference_weight=payload.preference_weight,
        failover_region_id=payload.failover_region_id,
        latency_ms_hint=payload.latency_ms_hint,
    )


@router.get("/distributed/regions/{region_id}/capacity")
def region_capacity_v1(region_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return region_svc.region_capacity_summary(region_id)


@router.post("/distributed/regions/{region_id}/failover")
def region_failover_v1(region_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return dr_svc.failover_region(region_id=region_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/distributed/federations")
def list_federations_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not federation_enabled():
        raise HTTPException(status_code=503, detail="federation_disabled")
    return {"items": fed_svc.list_federation_tree()}


@router.post("/distributed/federations")
def create_federation_v1(payload: FederationCreate, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not federation_enabled():
        raise HTTPException(status_code=503, detail="federation_disabled")
    return fed_svc.create_federation(
        name=payload.name,
        parent_federation_id=payload.parent_federation_id,
        scope=payload.scope,
        config=payload.config,
    )


@router.post("/distributed/federations/{federation_id}/regions")
def attach_federation_region_v1(
    federation_id: str,
    payload: FederationAttachRegion,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not federation_enabled():
        raise HTTPException(status_code=503, detail="federation_disabled")
    return fed_svc.attach_region(
        federation_id=federation_id,
        region_id=payload.region_id,
        tenant_scope=payload.tenant_scope,
        policy_scope=payload.policy_scope,
    )


@router.get("/distributed/edge-nodes")
def list_edge_nodes_v1(
    cluster_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not edge_deployment_enabled():
        raise HTTPException(status_code=503, detail="edge_deployment_disabled")
    return {"items": edge_svc.list_edge_nodes(cluster_id=cluster_id)}


@router.post("/distributed/edge-nodes")
def register_edge_v1(payload: EdgeRegister, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not edge_deployment_enabled():
        raise HTTPException(status_code=503, detail="edge_deployment_disabled")
    try:
        return edge_svc.register_edge_node(
            cluster_id=payload.cluster_id,
            name=payload.name,
            deployment_kind=payload.deployment_kind,
            sync_mode=payload.sync_mode,
            config=payload.config,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/distributed/edge-nodes/{edge_id}/sync")
def sync_edge_v1(edge_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return edge_svc.sync_edge_node(edge_id=edge_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/distributed/edge-nodes/{edge_id}/offline")
def offline_edge_v1(edge_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return edge_svc.set_offline_mode(edge_id=edge_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/distributed/edge-nodes/{edge_id}/reconnect")
def reconnect_edge_v1(edge_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return edge_svc.reconnect_edge(edge_id=edge_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/distributed/scheduler/place")
def place_run_v1(payload: PlaceRunRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not global_scheduler_enabled():
        raise HTTPException(status_code=503, detail="global_scheduler_disabled")
    try:
        return sched_svc.place_run(
            run_id=payload.run_id,
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            gpu_required=payload.gpu_required,
            region_preference=payload.region_preference,
            cluster_labels=payload.cluster_labels,
            latency_budget_ms=payload.latency_budget_ms,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/distributed/scheduler/placements/{run_id}")
def get_placement_v1(run_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    placement = sched_svc.get_placement(run_id)
    if not placement:
        raise HTTPException(status_code=404, detail="placement_not_found")
    return placement


@router.get("/distributed/replication/jobs")
def list_replication_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return {"items": repl_svc.list_replication_jobs()}


@router.post("/distributed/replication/jobs")
def enqueue_replication_v1(payload: ReplicationEnqueue, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return repl_svc.enqueue_replication(
            source_region_id=payload.source_region_id,
            target_region_id=payload.target_region_id,
            resource_type=payload.resource_type,
            resource_id=payload.resource_id,
            payload=payload.payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/distributed/replication/bundle")
def replicate_bundle_v1(payload: ReplicationBundle, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return repl_svc.replicate_metadata_bundle(
        source_region_id=payload.source_region_id,
        target_region_id=payload.target_region_id,
        resources=payload.resources,
    )


@router.post("/distributed/replication/jobs/{job_id}/run")
def run_replication_v1(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return repl_svc.run_replication_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/distributed/dr/snapshots")
def list_dr_snapshots_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not disaster_recovery_enabled():
        raise HTTPException(status_code=503, detail="disaster_recovery_disabled")
    return {"items": dr_svc.list_snapshots()}


@router.post("/distributed/dr/snapshots")
def create_dr_snapshot_v1(payload: DrSnapshotCreate, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not disaster_recovery_enabled():
        raise HTTPException(status_code=503, detail="disaster_recovery_disabled")
    return dr_svc.create_metadata_snapshot(scope=payload.scope, region_id=payload.region_id)


@router.get("/distributed/dr/snapshots/{snapshot_id}")
def get_dr_snapshot_v1(snapshot_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    snap = dr_svc.get_snapshot(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="snapshot_not_found")
    return snap


@router.post("/distributed/dr/snapshots/{snapshot_id}/restore")
def restore_dr_v1(
    snapshot_id: str,
    dry_run: bool = Query(default=True),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return dr_svc.restore_from_snapshot(snapshot_id=snapshot_id, dry_run=dry_run)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/distributed/identity/trusts")
def list_trusts_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not global_identity_enabled():
        raise HTTPException(status_code=503, detail="global_identity_disabled")
    return {"items": identity_svc.list_trusts()}


@router.post("/distributed/identity/trusts")
def create_trust_v1(payload: TrustCreate, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not global_identity_enabled():
        raise HTTPException(status_code=503, detail="global_identity_disabled")
    try:
        return identity_svc.create_trust(
            source_domain=payload.source_domain,
            target_domain=payload.target_domain,
            trust_kind=payload.trust_kind,
            config=payload.config,
            enabled=payload.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/distributed/identity/trusts/evaluate")
def evaluate_trust_v1(
    source_domain: str = Query(...),
    target_domain: str = Query(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return identity_svc.evaluate_trust(source_domain=source_domain, target_domain=target_domain)


@router.get("/distributed/observability/global")
def global_observability_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not global_observability_enabled():
        raise HTTPException(status_code=503, detail="global_observability_disabled")
    return obs_svc.build_global_dashboard()


@router.get("/distributed/extensions")
def list_extensions_v1(
    point_type: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not extension_platform_enabled():
        raise HTTPException(status_code=503, detail="extension_platform_disabled")
    return {"items": ext_svc.list_extensions(point_type=point_type)}


@router.get("/distributed/extensions/catalog")
def extension_catalog_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return ext_svc.extension_catalog()


@router.post("/distributed/extensions")
def register_extension_v1(payload: ExtensionRegister, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticate_bearer(authorization)
    if not extension_platform_enabled():
        raise HTTPException(status_code=503, detail="extension_platform_disabled")
    try:
        return ext_svc.register_extension(
            point_type=payload.point_type,
            name=payload.name,
            version=payload.version,
            entrypoint=payload.entrypoint,
            config=payload.config,
            enabled=payload.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/distributed/observability")
def project_global_obs_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return obs_svc.build_global_dashboard()
