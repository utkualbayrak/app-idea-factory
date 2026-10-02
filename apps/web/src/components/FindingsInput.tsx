import { Plus, X } from "lucide-react";
import type { FindingKind, FindingPlatform, FindingSeverity, TestFinding } from "@/lib/api";
import { FINDING_KIND_LABELS, FINDING_PLATFORM_LABELS, SEVERITY_LABELS } from "@/lib/test-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MAX_FINDINGS = 100;

// Test bulguları: her satır önem + tür (+ platform, iki platform test
// edildiyse) + kısa açıklama.
export function FindingsInput({
  values,
  onChange,
  showPlatform,
  defaultPlatform,
}: {
  values: TestFinding[];
  onChange: (values: TestFinding[]) => void;
  showPlatform: boolean;
  defaultPlatform: FindingPlatform;
}) {
  function update(index: number, patch: Partial<TestFinding>) {
    onChange(values.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  return (
    <div className="flex flex-col gap-3">
      {values.map((finding, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center">
          <div className={`grid gap-2 ${showPlatform ? "grid-cols-3" : "grid-cols-2"} sm:w-auto sm:shrink-0`}>
            <MiniSelect
              value={finding.severity}
              options={SEVERITY_LABELS}
              onChange={(severity) => update(index, { severity })}
              ariaLabel="Önem"
            />
            <MiniSelect
              value={finding.kind}
              options={FINDING_KIND_LABELS}
              onChange={(kind) => update(index, { kind })}
              ariaLabel="Tür"
            />
            {showPlatform && (
              <MiniSelect
                value={finding.platform}
                options={FINDING_PLATFORM_LABELS}
                onChange={(platform) => update(index, { platform })}
                ariaLabel="Platform"
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              value={finding.text}
              maxLength={300}
              placeholder="Kısaca ne oldu…"
              onChange={(e) => update(index, { text: e.target.value })}
              aria-label={`Bulgu ${index + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Bulguyu kaldır"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={values.length >= MAX_FINDINGS}
        onClick={() =>
          onChange([...values, { severity: "major", kind: "bug", platform: defaultPlatform, text: "" }])
        }
      >
        <Plus className="size-4" />
        Bulgu ekle
      </Button>
    </div>
  );
}

function MiniSelect<T extends FindingSeverity | FindingKind | FindingPlatform>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-9 w-full sm:w-36" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(options) as T[]).map((key) => (
          <SelectItem key={key} value={key}>
            {options[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
