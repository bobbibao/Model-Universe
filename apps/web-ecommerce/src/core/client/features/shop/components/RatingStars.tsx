interface RatingStarsProps {
  rating: number;
  size?: 'sm' | 'md';
}

// Five stars filled up to the rounded rating.
const RatingStars = ({ rating, size = 'md' }: RatingStarsProps) => {
  const filled = Math.round(rating);
  const dimension = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className="inline-flex items-center" aria-label={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`${dimension} ${star <= filled ? 'fill-brand-hover' : 'fill-stroke dark:fill-store-card'}`}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
};

export default RatingStars;
