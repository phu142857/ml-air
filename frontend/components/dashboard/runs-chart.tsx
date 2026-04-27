"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = {
  success: number;
  failed: number;
  running: number;
};

export function RunsChart({ success, failed, running }: Props) {
  const data = [
    { name: "SUCCESS", value: success },
    { name: "FAILED", value: failed },
    { name: "RUNNING", value: running }
  ];

  return (
    <div className="h-56 w-full rounded-xl border border-slate-700 bg-slate-900 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" stroke="#6B7280" />
          <YAxis stroke="#6B7280" />
          <Tooltip />
          <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
