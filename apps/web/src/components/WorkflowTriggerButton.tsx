import { useState } from "react";
import type { ReactNode } from "react";
import { triggerWorkflow, type DispatchableWorkflow } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface WorkflowTriggerButtonProps {
  label: string;
  loadingLabel: string;
  successMessage: string;
  workflow: DispatchableWorkflow;
  inputs?: Record<string, string>;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  icon?: ReactNode;
}

// Ayarlar'daki manuel cron tetikleme, detay sayfasındaki "yeniden
// değerlendir" ve "rakipleri bul" butonlarının ortak davranışı: tetikle,
// sonucu senkron bekleme (workflow arka planda dakikalar sürer), kısa bir
// durum mesajı göster.
export function WorkflowTriggerButton({
  label,
  loadingLabel,
  successMessage,
  workflow,
  inputs,
  disabled,
  variant = "outline",
  icon,
}: WorkflowTriggerButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    try {
      await triggerWorkflow(workflow, inputs);
      setMessage(successMessage);
    } catch (err) {
      setMessage(
        `Tetiklenemedi: ${err instanceof Error ? err.message : String(err)}. GH_WORKFLOW_DISPATCH_TOKEN Worker secret'ı eklenmemiş olabilir.`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant={variant} onClick={handleClick} disabled={disabled || loading} className="w-fit">
        {icon}
        {loading ? loadingLabel : label}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
