import { useEffect, useMemo, useState } from "react";
import { fetchIdeas, type Idea, type IdeaStatus } from "../lib/api";
import { IdeaCard } from "../components/IdeaCard";

type SortKey = "date" | "claude" | "user";

const STATUS_LABELS: Record<IdeaStatus, string> = {
  new: "Yeni",
  archived: "Arşivlenmiş",
  in_development: "Geliştiriliyor",
  developed: "Geliştirildi",
};

export function IdeaListPage() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<IdeaStatus | "all">("all");
  const [minRating, setMinRating] = useState(0);
  const [onlyUnrated, setOnlyUnrated] = useState(false);

  useEffect(() => {
    fetchIdeas()
      .then((res) => setIdeas(res.ideas))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const categories = useMemo(() => {
    if (!ideas) return [];
    return [...new Set(ideas.map((idea) => idea.category))].sort();
  }, [ideas]);

  const filteredSorted = useMemo(() => {
    if (!ideas) return [];

    let result = ideas;
    if (category !== "all") result = result.filter((idea) => idea.category === category);
    if (status !== "all") result = result.filter((idea) => idea.status === status);
    if (minRating > 0) result = result.filter((idea) => (idea.user_rating ?? 0) >= minRating);
    if (onlyUnrated) result = result.filter((idea) => idea.user_rating == null);

    const sorted = [...result];
    if (sortBy === "claude") {
      sorted.sort((a, b) => b.scores.overall - a.scores.overall);
    } else if (sortBy === "user") {
      sorted.sort((a, b) => (b.user_rating ?? -1) - (a.user_rating ?? -1));
    } else {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    return sorted;
  }, [ideas, category, status, minRating, onlyUnrated, sortBy]);

  const groups = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const idea of filteredSorted) {
      const list = map.get(idea.batch_date) ?? [];
      list.push(idea);
      map.set(idea.batch_date, list);
    }
    // Tarih grupları her zaman en yeniden eskiye; grup içi sıra
    // filteredSorted'daki genel sıralamayı (sortBy) korur.
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredSorted]);

  if (error) return <p className="error">Fikirler yüklenemedi: {error}</p>;
  if (!ideas) return <p className="loading">Yükleniyor…</p>;

  return (
    <div className="idea-list-page">
      <div className="filters">
        <label>
          Sırala
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
            <option value="date">Tarih</option>
            <option value="claude">Claude puanı</option>
            <option value="user">Kullanıcı puanı</option>
          </select>
        </label>

        <label>
          Kategori
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Hepsi</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          Durum
          <select value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus | "all")}>
            <option value="all">Hepsi</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Min. puan
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
            <option value={0}>Hepsi</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+ yıldız
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-label">
          <input type="checkbox" checked={onlyUnrated} onChange={(e) => setOnlyUnrated(e.target.checked)} />
          Yalnızca puanlanmamışlar
        </label>
      </div>

      {groups.length === 0 && <p className="empty">Bu filtrelere uyan fikir yok.</p>}

      {groups.map(([batchDate, batchIdeas]) => (
        <section key={batchDate} className="idea-group">
          <h2>{batchDate}</h2>
          <div className="idea-grid">
            {batchIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
