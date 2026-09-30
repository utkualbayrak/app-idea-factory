import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchIdea, patchIdea, type Idea } from "../lib/api";
import { StarRating } from "../components/StarRating";

export function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchIdea(id)
      .then((res) => {
        setIdea(res.idea);
        setNote(res.idea.user_note ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  async function handleRate(value: number) {
    if (!id) return;
    const res = await patchIdea(id, { user_rating: value });
    setIdea(res.idea);
  }

  async function handleSaveNote() {
    if (!id) return;
    setSaving(true);
    try {
      const res = await patchIdea(id, { user_note: note || null });
      setIdea(res.idea);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (!id || !idea) return;
    const nextStatus = idea.status === "archived" ? "new" : "archived";
    const res = await patchIdea(id, { status: nextStatus });
    setIdea(res.idea);
  }

  if (error) return <p className="error">Fikir yüklenemedi: {error}</p>;
  if (!idea) return <p className="loading">Yükleniyor…</p>;

  return (
    <div className="idea-detail-page">
      <Link to="/" className="back-link">
        ← Fikirler
      </Link>

      <h1>{idea.name}</h1>
      <p className="one-liner">{idea.one_liner}</p>

      <div className="scores-breakdown">
        <ScoreBar label="Pazar" value={idea.scores.market} />
        <ScoreBar label="Uygulanabilirlik (solo)" value={idea.scores.feasibility_solo_dev} />
        <ScoreBar label="Özgünlük" value={idea.scores.originality} />
        <ScoreBar label="Genel" value={idea.scores.overall} highlight />
      </div>

      <section>
        <h2>Problem</h2>
        <p>{idea.problem}</p>
      </section>

      <section>
        <h2>Hedef kitle</h2>
        <p>{idea.target_audience}</p>
      </section>

      <section>
        <h2>Temel özellikler</h2>
        <ul>
          {idea.core_features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Gelir modeli</h2>
        <p>{idea.monetization}</p>
      </section>

      <section>
        <h2>İlham kaynağı</h2>
        <a href={idea.inspiration_source} target="_blank" rel="noreferrer">
          {idea.inspiration_source}
        </a>
      </section>

      <section className="rating-section">
        <h2>Senin puanın</h2>
        <StarRating value={idea.user_rating} onChange={handleRate} size="lg" />
      </section>

      <section className="note-section">
        <h2>Not</h2>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Kısa bir not ekle…" />
        <button type="button" onClick={handleSaveNote} disabled={saving}>
          {saving ? "Kaydediliyor…" : "Notu kaydet"}
        </button>
      </section>

      <div className="actions">
        <button type="button" onClick={handleToggleArchive} className="secondary">
          {idea.status === "archived" ? "Arşivden çıkar" : "Arşivle"}
        </button>
        <button type="button" disabled title="Faz 3'te gelecek" className="primary">
          Geliştir (yakında)
        </button>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`score-bar ${highlight ? "score-bar--highlight" : ""}`}>
      <span className="score-bar__label">{label}</span>
      <div className="score-bar__track">
        <div className="score-bar__fill" style={{ width: `${value * 10}%` }} />
      </div>
      <span className="score-bar__value">{value}/10</span>
    </div>
  );
}
