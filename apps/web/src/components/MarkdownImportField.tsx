import { useRef, useState } from "react";
import { Eye, FileText, Pencil, Upload, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Okunacak dosyanın üst sınırı; metin sınırı (maxLength) ayrıca uygulanır.
const MAX_FILE_BYTES = 1024 * 1024;
const ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";

function isTextFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/");
}

// Serbest metin alanı + Markdown içe aktarma: yapıştırılabilir, bir .md/.txt
// dosyası sürükleyip bırakılabilir ya da seçilebilir. İçe aktarılan metin
// kutuya dolar (düzenlenebilir); Düzenle/Önizle ile Markdown olarak görülür.
// Sınırı aşan metin kesilmez: sayaç kırmızı olur, kaydetmeyi üst bileşen kapatır.
export function MarkdownImportField({
  id,
  label,
  value,
  onChange,
  minLength,
  maxLength,
  placeholder,
  onImported,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  minLength: number;
  maxLength: number;
  placeholder?: string;
  /** İçe aktarılan dosyanın metni; ör. başlıktan ad önermek için. */
  onImported?: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; text: string } | null>(null);

  function apply(file: { name: string; text: string }) {
    onChange(file.text);
    setFileName(file.name);
    setPreview(true);
    onImported?.(file.text);
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!isTextFile(file)) {
      setError("Yalnızca .md, .markdown veya .txt dosyası içe aktarılabilir.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Dosya 1 MB'tan büyük.");
      return;
    }
    let text: string;
    try {
      text = (await file.text()).replace(/\r\n/g, "\n");
    } catch {
      setError("Dosya okunamadı.");
      return;
    }
    if (value.trim()) setPending({ name: file.name, text });
    else apply({ name: file.name, text });
  }

  const length = value.trim().length;
  const tooLong = length > maxLength;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            Dosyadan içe aktar
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={!value.trim()} onClick={() => setPreview((p) => !p)}>
            {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />}
            {preview ? "Düzenle" : "Önizle"}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {fileName && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          <span className="min-w-0 truncate">{fileName}</span>
          <button
            type="button"
            className="cursor-pointer rounded p-0.5 hover:bg-muted"
            aria-label="Dosya etiketini kaldır"
            onClick={() => setFileName(null)}
          >
            <X className="size-3" />
          </button>
        </p>
      )}

      <div
        className={`relative rounded-md ${dragging ? "outline-2 outline-offset-2 outline-primary outline-dashed" : ""}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          void readFile(e.dataTransfer.files[0]);
        }}
      >
        {preview && value.trim() ? (
          <div className="max-h-[32rem] min-h-48 overflow-y-auto rounded-md border px-4 py-2">
            <Markdown>{value}</Markdown>
          </div>
        ) : (
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
            placeholder={placeholder}
          />
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/80 text-sm font-medium">
            Bırak — dosyanın içeriği buraya gelir
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {length < minLength
          ? `En az ${minLength} karakter. Yazabilir, yapıştırabilir ya da bir .md dosyasını buraya sürükleyebilirsin.`
          : tooLong
            ? `${length.toLocaleString("tr-TR")} / ${maxLength.toLocaleString("tr-TR")} karakter — belgeyi ${maxLength.toLocaleString("tr-TR")} karaktere indir.`
            : `${length.toLocaleString("tr-TR")} / ${maxLength.toLocaleString("tr-TR")} karakter`}
      </p>

      <AlertDialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Metnin yerine dosya gelsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Kutudaki mevcut metin silinir ve {pending?.name} dosyasının içeriği yazılır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) apply(pending);
                setPending(null);
              }}
            >
              Değiştir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
