"use client";

import Link from "next/link";
import { SettingsPage, SettingsPageHeader, SettingsSection } from "@/components/settings/enterprise";
import { BUILTIN_ROLES } from "@/lib/identity-admin-api";

export default function IdentityRolesPage() {
  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Roles"
        description="Built-in platform roles. Custom roles are not supported in IAM v1."
      />

      <SettingsSection id="roles" title="Built-in roles" description="Fixed permission bundles assigned to users.">
        <div className="space-y-4">
          {BUILTIN_ROLES.map((role) => (
            <div key={role.id} className="rounded-md border border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{role.id}</code>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{role.description}</p>
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissions</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <li key={perm} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
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
          <Link href="/identity/users" className="text-primary hover:underline">
            Users
          </Link>{" "}
          detail page. Global Admin is set on the user account; Maintainer and Viewer are tenant/project assignments.
        </p>
      </SettingsSection>
    </SettingsPage>
  );
}
