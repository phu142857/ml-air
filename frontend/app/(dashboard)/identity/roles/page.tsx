"use client";

import { DetailSection } from "@/components/mlops/layout";
import { BUILTIN_ROLES } from "@/lib/identity-admin-api";

export default function IdentityRolesPage() {
  return (
    <div className="space-y-4">
      <DetailSection
        title="Built-in roles"
        description="Fixed platform roles. Custom roles are not supported in IAM v1."
      >
        <div className="space-y-4">
          {BUILTIN_ROLES.map((role) => (
            <div key={role.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{role.name}</h3>
                <code className="text-xs text-muted-foreground">{role.id}</code>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissions</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <li key={perm} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Assign roles to users from the{" "}
          <a href="/identity/users" className="text-primary hover:underline">
            Users
          </a>{" "}
          detail page. Global Admin is set on the user account; Maintainer and Viewer are tenant/project assignments.
        </p>
      </DetailSection>
    </div>
  );
}
