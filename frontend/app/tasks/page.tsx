"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RouteShell } from "@/components/layout/route-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TasksPage() {
  const router = useRouter();
  const [taskId, setTaskId] = useState("");

  return (
    <RouteShell activeNav="Tasks" title="Tasks" subtitle="Task-level logs, metrics and artifacts">
      <Card>
        <CardHeader>
          <CardTitle>Task Detail</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="flex items-center gap-2">
          <input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="Enter task_id"
            className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground"
          />
          <Button
            onClick={() => {
              if (!taskId.trim()) return;
              router.push(`/tasks/${taskId.trim()}`);
            }}
          >
            Open Task
          </Button>
        </div>
        </CardContent>
      </Card>
    </RouteShell>
  );
}
