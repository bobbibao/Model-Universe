'use client';

import { useCallback, useEffect, useState } from 'react';
import ProductApi from '@/core/client/api/Product';
import ReviewApi from '@/core/client/api/Review';
import { useCurrentUser } from '@/shared/client/providers/CurrentUserProvider';
import UserAvatar from '@/components/UserAvatar';
import type { Pagination } from '@/shared/types/pagination';
import type { RatingDistribution, Review } from '@/shared/types/product';
import RatingStars from './RatingStars';
import ReviewForm from './ReviewForm';

const REVIEWS_PER_PAGE = 3;

interface ProductReviewsProps {
  productId: number;
  rating: number;
  reviewCount: number;
  distribution: RatingDistribution;
  onReviewSubmitted: () => void;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString('vi-VN');

const ProductReviews = ({ productId, rating, reviewCount, distribution, onReviewSubmitted }: ProductReviewsProps) => {
  const { user } = useCurrentUser();
  const [canReview, setCanReview] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(
    async (page: number) => {
      setLoading(true);
      const result = await ProductApi.getReviews(productId, page, REVIEWS_PER_PAGE);
      if (result) {
        setReviews((current) => (page === 1 ? result.data : [...current, ...result.data]));
        setPagination(result.pagination);
      }
      setLoading(false);
    },
    [productId],
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  // Only customers with a delivered order of this product who have not reviewed it yet see the form.
  useEffect(() => {
    if (!user) {
      setCanReview(false);
      return;
    }
    ReviewApi.getEligibility(productId).then((result) => setCanReview(!!result?.canReview));
  }, [user, productId]);

  const handleSubmitted = () => {
    setCanReview(false);
    loadPage(1);
    onReviewSubmitted();
  };

  return (
    <section className="mt-16">
      <h2 className="mb-6 text-2xl font-bold">Đánh giá sản phẩm</h2>
      {canReview && <ReviewForm productId={productId} onSubmitted={handleSubmitted} />}
      {reviewCount === 0 ? (
        <p className="text-body dark:text-store-muted">Chưa có đánh giá nào cho sản phẩm này.</p>
      ) : (
        <div className="grid gap-10 lg:grid-cols-3">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-5xl font-bold">{rating.toFixed(1)}</span>
              <div>
                <RatingStars rating={rating} />
                <p className="text-sm text-body dark:text-store-muted">{reviewCount} đánh giá</p>
              </div>
            </div>
            {(['5', '4', '3', '2', '1'] as const).map((star) => {
              const percent = reviewCount > 0 ? Math.round((distribution[star] / reviewCount) * 100) : 0;
              return (
                <div key={star} className="mb-2 flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0">{star} sao</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stroke dark:bg-store-card">
                    <div className="h-full rounded-full bg-brand-hover" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-body dark:text-store-muted">{percent}%</span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-6 lg:col-span-2">
            {reviews.map((review) => (
              <article key={review.id} className="border-b border-stroke pb-6 dark:border-store-card">
                <div className="mb-2 flex items-center gap-3">
                  <UserAvatar
                    user={{ firstName: review.author, lastName: '', avatar: review.authorAvatar }}
                    size={36}
                  />
                  <span className="font-semibold">{review.author}</span>
                </div>
                <div className="mb-1 flex items-center gap-2">
                  <RatingStars rating={review.rating} size="sm" />
                  <span className="font-semibold">{review.title}</span>
                </div>
                <p className="mb-2 text-sm text-body dark:text-store-muted">
                  Đánh giá{review.location ? ` tại ${review.location}` : ''} ngày {formatDate(review.createdAt)}
                </p>
                {review.content && <p className="whitespace-pre-line">{review.content}</p>}
              </article>
            ))}
            {pagination?.hasNextPage && (
              <button
                onClick={() => loadPage(pagination.page + 1)}
                disabled={loading}
                className="self-start rounded-md bg-gray px-5 py-2 font-medium text-black hover:opacity-90 disabled:opacity-60 dark:bg-store-card dark:text-store-text"
              >
                {loading ? 'Đang tải...' : 'Xem thêm'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ProductReviews;
