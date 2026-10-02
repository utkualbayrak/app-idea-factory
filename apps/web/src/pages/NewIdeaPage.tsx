import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { createManualIdea, fetchIdeas, type ManualIdeaInput } from "@/lib/api";
import { PageHeader, PageMessage } from "@/components/PageHeader";
import { RowListInput } from "@/components/RowListInput";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Mode = "describe" | "form";

const DESCRIPTION_MIN = 30;

// Cron'un bulamadığı, kullanıcının aklına gelen fikirler. İki yol:
// - Açıklama: serbestçe anlatırsın, Claude sistemin alanlarına dönüştürüp puanlar.
// - Form: alanları kendin doldurursun, sonra istersen Claude puanlar.
export function NewIdeaPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("describe");
  const [categories, setCategories] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [oneLiner, setOneLiner] = useState("");
  const [problem, setProblem] = useState("");
  const [audience, setAudience] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [monetization, setMonetization] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kategori alanında mevcut kategoriler öneri olarak çıksın.
  useEffect(() => {
    fetchIdeas()
      .then((res) => setCategories([...new Set(res.ideas.map((i) => i.category).filter(Boolean))].sort()))
      .catch(() => {});
  }, []);

  const describeValid = description.trim().length >= DESCRIPTION_MIN;
  const formValid =
    name.trim() !== "" &&
    oneLiner.trim() !== "" &&
    problem.trim() !== "" &&
    audience.trim() !== "" &&
    features.length > 0 &&
    monetization.trim() !== "" &&
    category.trim() !== "";
  const valid = mode === "describe" ? describeValid : formValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    const input: ManualIdeaInput =
      mode === "describe"
        ? { mode, name: name.trim() || undefined, description: description.trim() }
        : {
            mode,
            name: name.trim(),
            one_liner: oneLiner.trim(),
            problem: problem.trim(),
            target_audience: audience.trim(),
            core_features: features,
            monetization: monetization.trim(),
            category: category.trim(),
            tags,
          };
    try {
      const res = await createManualIdea(input);
      navigate(`/ideas/${res.idea.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes("HTTP 409") ? message.replace(/^.*— /, "") : `Kaydedilemedi: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Link to="/ideas" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Fikirler
      </Link>
      <PageHeader
        title="Fikir ekle"
        description="Günlük taramanın bulamadığı bir fikrin mi var? Anlat ya da formu doldur; günlük fikirlerle aynı listede, aynı ölçütlerle değerlendirilir."
      />

      <SegmentedControl
        value={mode}
        onChange={setMode}
        ariaLabel="Giriş yolu"
        options={[
          { value: "describe", label: "Anlat, Claude doldursun" },
          { value: "form", label: "Formu kendim doldurayım" },
        ]}
      />

      {mode === "describe" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Fikrini anlat</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ne çözüyor, kimin için, temel olarak ne yapıyor, nasıl para kazanır, aklındaki özel detaylar (örn. iOS
              hareketleri, widget)… Ne kadar ayrıntılı yazarsan Claude o kadar sadık kalır. Kaydedince Claude alanları
              doldurup puanlar (birkaç dakika).
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="describe-name">Ad (isteğe bağlı, İngilizce)</Label>
              <Input
                id="describe-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Boş bırakırsan Claude koyar"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="describe-text">Açıklama</Label>
              <Textarea
                id="describe-text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={12}
                maxLength={8000}
                placeholder="Kafandaki uygulamayı anlat…"
              />
              <p className="text-xs text-muted-foreground">
                {description.trim().length < DESCRIPTION_MIN
                  ? `En az ${DESCRIPTION_MIN} karakter.`
                  : `${description.trim().length} / 8000 karakter`}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm tracking-wide text-muted-foreground uppercase">Fikir</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ad, kategori ve etiketler İngilizce; diğerleri Türkçe. Puanlar boş kalır; kaydettikten sonra detay
              sayfasından Claude'a puanlatabilirsin.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="form-name" label="Ad">
              <Input id="form-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="MealMate" />
            </Field>
            <Field id="form-category" label="Kategori">
              <Input
                id="form-category"
                value={category}
                maxLength={40}
                list="category-options"
                onChange={(e) => setCategory(e.target.value)}
                placeholder="productivity"
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field id="form-one-liner" label="Tek cümlelik özet" wide>
              <Input id="form-one-liner" value={oneLiner} maxLength={300} onChange={(e) => setOneLiner(e.target.value)} />
            </Field>
            <Field id="form-problem" label="Problem" wide>
              <Textarea id="form-problem" value={problem} maxLength={2000} rows={3} onChange={(e) => setProblem(e.target.value)} />
            </Field>
            <Field id="form-audience" label="Hedef kitle" wide>
              <Input id="form-audience" value={audience} maxLength={1000} onChange={(e) => setAudience(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Temel özellikler (3–5 önerilir)</Label>
              <RowListInput values={features} onChange={setFeatures} placeholder="Bir özellik…" max={10} />
            </div>
            <Field id="form-monetization" label="Gelir modeli" wide>
              <Input id="form-monetization" value={monetization} maxLength={1000} onChange={(e) => setMonetization(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Etiketler (isteğe bağlı, en fazla 4)</Label>
              <RowListInput values={tags} onChange={setTags} placeholder="habit" max={4} />
            </div>
          </CardContent>
        </Card>
      )}

      {error && <PageMessage tone="error">{error}</PageMessage>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!valid || submitting}>
          {submitting ? "Kaydediliyor…" : mode === "describe" ? "Kaydet ve Claude'a gönder" : "Kaydet"}
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate("/ideas")}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, wide, children }: { id: string; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
