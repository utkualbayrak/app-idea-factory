import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  deleteIdeaImage,
  ideaImageUrl,
  updateIdeaImage,
  uploadIdeaImage,
  type IdeaImage,
  type ImageRole,
} from "@/lib/api";
import { prepareImage } from "@/lib/image-prep";
import { IMAGE_ROLE_DESCRIPTIONS, IMAGE_ROLE_LABELS, MAX_IMAGES_PER_IDEA } from "@/lib/image-labels";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// error: null = yükleniyor, "" = yüklendi, metin = hata.
interface UploadState {
  name: string;
  error: string | null;
}

// Fikrin görselleri: ekran tasarımı / ilham / varlık. Planlama belgeleri ve
// iskelet bunları kullanır. İskelet aşamasında (locked) salt okunur.
export function IdeaImagesCard({
  ideaId,
  images,
  onImagesChange,
  locked,
  onChanged,
}: {
  ideaId: string;
  images: IdeaImage[];
  onImagesChange: (images: IdeaImage[]) => void;
  locked: boolean;
  /** Fikir yeniden yüklensin (images_changed_at uyarısı için). */
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<IdeaImage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  // Kapalıyken ızgara sabit yükseklikte; taşıyor mu diye ölçülür (sütun sayısı
  // ekrana göre değiştiği için görsel sayısından tahmin edilemez).
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const measure = () => setOverflowing(node.scrollHeight > node.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [images.length, expanded]);
  const uploading = uploads.some((u) => u.error === null);
  const remaining = MAX_IMAGES_PER_IDEA - images.length;

  async function addFiles(files: File[]) {
    setError(null);
    if (files.length === 0) return;
    const accepted = files.slice(0, Math.max(0, remaining));
    if (accepted.length < files.length) {
      setError(`Bir fikre en fazla ${MAX_IMAGES_PER_IDEA} görsel eklenebilir; fazlası alınmadı.`);
    }
    setUploads(accepted.map((f) => ({ name: f.name, error: null })));
    let current = images;
    for (const [index, file] of accepted.entries()) {
      try {
        const prepared = await prepareImage(file);
        const { image } = await uploadIdeaImage(ideaId, prepared, { role: "inspiration" });
        current = [...current, image];
        onImagesChange(current);
        setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, error: "" } : u)));
      } catch (err) {
        const message = err instanceof Error ? err.message.replace(/^.*— /, "") : String(err);
        setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, error: message } : u)));
      }
    }
    // Başarılı olanlar ("" hata) listeden düşer, hatalılar görünür kalır.
    setUploads((prev) => prev.filter((u) => u.error));
    onChanged();
  }

  async function patch(image: IdeaImage, change: { role?: ImageRole; caption?: string | null; position?: number }) {
    setError(null);
    try {
      const res = await updateIdeaImage(ideaId, image.id, change);
      onImagesChange(images.map((i) => (i.id === image.id ? res.image : i)));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Komşusuyla yer değiştirir; iki pozisyon da yeniden yazılır (sıralar
  // boşluklu olabilir).
  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const withPositions = reordered.map((image, position) => ({ ...image, position }));
    onImagesChange(withPositions);
    setError(null);
    try {
      await Promise.all([
        updateIdeaImage(ideaId, withPositions[index].id, { position: index }),
        updateIdeaImage(ideaId, withPositions[target].id, { position: target }),
      ]);
      onChanged();
    } catch (err) {
      onImagesChange(images);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(image: IdeaImage) {
    setError(null);
    try {
      await deleteIdeaImage(ideaId, image.id);
      onImagesChange(images.filter((i) => i.id !== image.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card id="gorseller" className="min-w-0 scroll-mt-44">
      <CardHeader>
        <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Görseller</CardTitle>
        <p className="text-xs text-muted-foreground">
          {locked
            ? "İskelet aşamasında görseller değiştirilemez; iskelet reposunda docs/design/ altında duruyorlar."
            : "Ekran tasarımları, logo ya da ilham görselleri. Geliştirmeye geçince Claude planlama belgelerini ve iskeleti bunlara göre hazırlar. Her görselin rolünü seç."}
        </p>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        {!locked && (
          <div
            className={`flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground ${dragging ? "border-primary bg-muted" : ""}`}
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
              if (!uploading) void addFiles([...e.dataTransfer.files]);
            }}
          >
            <p>Görselleri buraya sürükle ya da seç (PNG, JPEG, WebP).</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || remaining <= 0}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {uploading ? "Yükleniyor…" : "Görsel ekle"}
            </Button>
            <p className="text-xs">
              {images.length} / {MAX_IMAGES_PER_IDEA} görsel. Büyük görseller 2000 px'e küçültülür.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {uploads.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs">
            {uploads.map((u, i) => (
              <li key={`${u.name}-${i}`} className={u.error ? "text-destructive" : "text-muted-foreground"}>
                {u.name}: {u.error ? u.error : u.error === "" ? "yüklendi" : "yükleniyor…"}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        {images.length === 0 ? (
          locked && <p className="text-sm text-muted-foreground">Görsel eklenmemiş.</p>
        ) : (
          <>
          {/* Çok görsel sayfayı uzatmasın: kapalıyken sabit yükseklik, içeride kaydırma. */}
          <div
            ref={gridRef}
            className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${expanded ? "" : "max-h-[34rem] overflow-y-auto"}`}
          >
            {images.map((image, index) => (
              <div key={image.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-2">
                <button
                  type="button"
                  className="cursor-zoom-in overflow-hidden rounded bg-muted"
                  onClick={() => setOpen(image)}
                  aria-label="Büyüt"
                >
                  <img
                    src={ideaImageUrl(ideaId, image.id)}
                    alt={image.caption ?? IMAGE_ROLE_LABELS[image.role]}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-contain"
                  />
                </button>
                {locked ? (
                  <p className="text-xs">
                    <span className="font-medium">{IMAGE_ROLE_LABELS[image.role]}</span>
                    {image.caption && <span className="text-muted-foreground"> · {image.caption}</span>}
                  </p>
                ) : (
                  <>
                    <Select value={image.role} onValueChange={(v) => void patch(image, { role: v as ImageRole })}>
                      <SelectTrigger className="h-8 w-full" aria-label="Rol">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(IMAGE_ROLE_LABELS) as ImageRole[]).map((role) => (
                          <SelectItem key={role} value={role}>
                            {IMAGE_ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] leading-snug text-muted-foreground">{IMAGE_ROLE_DESCRIPTIONS[image.role]}</p>
                    <CaptionInput image={image} onSave={(caption) => void patch(image, { caption })} />
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Sola taşı"
                          disabled={index === 0}
                          onClick={() => void move(index, -1)}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Sağa taşı"
                          disabled={index === images.length - 1}
                          onClick={() => void move(index, 1)}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                      <ConfirmButton
                        label={<Trash2 className="size-4" />}
                        variant="ghost"
                        className="size-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Görsel silinsin mi?"
                        description="Görsel bu fikirden kaldırılır. Planlama belgeleri zaten üretildiyse onları yeniden üretmen gerekebilir."
                        confirmLabel="Sil"
                        confirmVariant="destructive"
                        onConfirm={() => remove(image)}
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {(overflowing || expanded) && (
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {expanded ? "Görselleri daralt" : `Tüm görselleri aç (${images.length})`}
            </Button>
          )}
          </>
        )}
      </CardContent>

      <Dialog open={open != null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-[min(96vw,64rem)] sm:max-w-[min(96vw,64rem)]">
          <DialogTitle className="text-sm">
            {open ? IMAGE_ROLE_LABELS[open.role] : ""}
            {open?.caption ? ` · ${open.caption}` : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">Görselin büyük hali</DialogDescription>
          {open && (
            <img
              src={ideaImageUrl(ideaId, open.id)}
              alt={open.caption ?? IMAGE_ROLE_LABELS[open.role]}
              className="max-h-[80svh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Not alanı: yazarken yerel, odak kaybında (ya da Enter'da) kaydeder.
function CaptionInput({ image, onSave }: { image: IdeaImage; onSave: (caption: string | null) => void }) {
  const [value, setValue] = useState(image.caption ?? "");
  function commit() {
    const next = value.trim() || null;
    if (next !== (image.caption ?? null)) onSave(next);
  }
  return (
    <Input
      value={value}
      maxLength={200}
      placeholder="Not (örn. ana ekran)"
      className="h-8 text-xs"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
