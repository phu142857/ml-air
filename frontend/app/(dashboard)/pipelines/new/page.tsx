"use client";

import { useRouter } from "next/navigation";
import { GitBranch } from "lucide-react";
import { PipelineImportWizard } from "@/components/mlops/pipeline-import-wizard";
import { PageScrollBody, ResourcePageHeader, ScopePinnedInline, SubpageBackLink } from "@/components/mlops/layout";
import { useAppContext } from "@/lib/app-context";
import { isScopePinned } from "@/lib/scope";
import { SCOPE_AGGREGATE_PIPELINES } from "@/lib/scope-messages";

export default function NewPipelinePage() {
  const router = useRouter();
  const { tenantId, projectId, token } = useAppContext();
  const scopePinned = isScopePinned(tenantId, projectId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SubpageBackLink href="/pipelines" label="Back to pipelines" />
      <ResourcePageHeader icon={GitBranch} accent="amber" title="Import pipeline" className="shrink-0" />
      <PageScrollBody>
        {!scopePinned ? (
          <ScopePinnedInline message={SCOPE_AGGREGATE_PIPELINES} />
        ) : (
          <PipelineImportWizard
            tenantId={tenantId}
            projectId={projectId}
            token={token}
            onCancel={() => router.push("/pipelines")}
          />
        )}
      </PageScrollBody>
    </div>
  );
}
