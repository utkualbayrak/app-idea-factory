import { Link } from "react-router-dom";
import type { Idea } from "../lib/api";
import { StarRating } from "./StarRating";

export function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <Link to={`/ideas/${idea.id}`} className={`idea-card ${idea.status === "archived" ? "idea-card--archived" : ""}`}>
      <div className="idea-card__header">
        <h3>{idea.name}</h3>
        <span className="idea-card__score" title="Claude genel puanı">
          {idea.scores.overall}/10
        </span>
      </div>
      <p className="idea-card__oneliner">{idea.one_liner}</p>
      <div className="idea-card__footer">
        <span className="idea-card__category">{idea.category}</span>
        <StarRating value={idea.user_rating} />
      </div>
    </Link>
  );
}
