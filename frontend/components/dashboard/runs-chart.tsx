"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = {
  success: number;
  failed: number;
  running: number;
};

export function RunsChart({ success, failed, running }: Props) {
  const data = [
    { name: "SUCCESS", value: success, fill: "var(--status-success-fg)" },
    { name: "FAILED", value: failed, fill: "var(--status-failed-fg)" },
    { name: "RUNNING", value: running, fill: "var(--primary)" },
  ];

  return (
    <div className="bezel-shell h-56 w-full">
      <div className="bezel-inner h-full p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
