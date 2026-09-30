interface StarRatingProps {
  value: number | null;
  onChange?: (value: number) => void;
  size?: "sm" | "lg";
}

export function StarRating({ value, onChange, size = "sm" }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];
  const interactive = Boolean(onChange);

  return (
    <span className={`star-rating star-rating--${size}`} role={interactive ? "radiogroup" : undefined}>
      {stars.map((star) => {
        const filled = value != null && star <= value;
        return (
          <button
            key={star}
            type="button"
            className={`star ${filled ? "star--filled" : ""}`}
            disabled={!interactive}
            aria-label={`${star} yıldız`}
            aria-pressed={filled}
            onClick={() => onChange?.(star)}
          >
            ★
          </button>
        );
      })}
    </span>
  );
}
