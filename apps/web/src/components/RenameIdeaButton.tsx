import { useState } from "react";
import { Pencil } from "lucide-react";
import { renameIdea, type Idea, type Task } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// "Geliştirme bekliyor" aşamasında fikrin adını değiştirme (gösterim koşulu:
// lib/idea-colors.ts canRenameIdea).

// Repo adı ve ad tekrarı kontrolü için önerilen biçim (zorunlu değil).
function nameHint(name: string): string | null {
  if (/\s/.test(name)) return "Boşluksuz bir ad önerilir (ör. MealMate).";
  if (/[^\x20-\x7e]/.test(name)) return "Yalnızca İngilizce harfler önerilir; repo adında Türkçe karakterler düşer.";
  if (name.length > 20) return "20 karakteri geçmeyen kısa bir ad önerilir.";
  return null;
}

export function RenameIdeaButton({
  idea,
  task,
  onRenamed,
}: {
  idea: Idea;
  task: Task | null;
  onRenamed: (idea: Idea) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(idea.name);
  const [updateDocs, setUpdateDocs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsEditable = task?.status === "ready";
  const trimmed = name.trim();
  const hint = trimmed ? nameHint(trimmed) : null;

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(idea.name);
      setUpdateDocs(true);
      setError(null);
    }
    setOpen(next);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed === idea.name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await renameIdea(idea.id, trimmed, docsEditable && updateDocs);
      onRenamed(res.idea);
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes(" — ") ? message.split(" — ").slice(1).join(" — ") : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Adı değiştir"
        title="Adı değiştir"
        onClick={() => handleOpenChange(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adı değiştir</DialogTitle>
            <DialogDescription>
              İskelet repo'su bu addan oluşturulur; geliştirmeye başladıktan sonra ad değiştirilemez.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rename-idea">Yeni ad</Label>
              <Input
                id="rename-idea"
                value={name}
                maxLength={40}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
              {hint && <p className="text-xs text-amber-700 dark:text-amber-400">{hint}</p>}
            </div>
            {docsEditable && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="rename-update-docs"
                  checked={updateDocs}
                  onCheckedChange={(value) => setUpdateDocs(value === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="rename-update-docs" className="leading-snug font-normal">
                  Planlama belgelerinde geçen “{idea.name}” adını da değiştir
                </Label>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving || !trimmed || trimmed === idea.name}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
