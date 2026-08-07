"use client";

import { MlopsEmptyState } from "@/components/mlops/layout";
import { Sparkles } from "lucide-react";

type Props = {
  feature: string;
  envVar: string;
};

export function ControlPlaneDisabled({ feature, envVar }: Props) {
  return (
    <MlopsEmptyState
      icon={Sparkles}
      title={`${feature} chưa bật`}
      description={`Bật flag ${envVar}=1 và khởi động lại API để sử dụng tính năng này.`}
    />
  );
}
