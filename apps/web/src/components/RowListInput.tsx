import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Kısa satırlardan oluşan liste girişi (büyük textarea yerine). Enter ya da
// "Ekle" ile satır eklenir; satırlar yerinde düzenlenebilir ve silinebilir.
// suggestions: tek tıkla eklenebilen öneriler (listede olmayanlar gösterilir).
export function RowListInput({
  values,
  onChange,
  placeholder,
  max = 30,
  suggestions = [],
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  max?: number;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const full = values.length >= max;
  const remainingSuggestions = suggestions.filter((s) => !values.includes(s));

  function add(value: string) {
    const trimmed = value.trim();
    if (!trimmed || values.includes(trimmed) || full) return;
    onChange([...values, trimmed]);
  }

  return (
    <div className="flex flex-col gap-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={value}
            maxLength={300}
            onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
            onBlur={() => {
              if (!value.trim()) onChange(values.filter((_, i) => i !== index));
            }}
            aria-label={`Satır ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Kaldır"
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
          }}
          placeholder={placeholder}
          maxLength={300}
          disabled={full}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            add(draft);
            setDraft("");
          }}
          disabled={!draft.trim() || full}
        >
          <Plus className="size-4" />
          Ekle
        </Button>
      </div>

      {remainingSuggestions.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Öneriler:</span>
          {remainingSuggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto max-w-full py-1 text-left text-xs font-normal whitespace-normal"
              onClick={() => add(suggestion)}
            >
              <Plus className="size-3 shrink-0" />
              {suggestion}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
