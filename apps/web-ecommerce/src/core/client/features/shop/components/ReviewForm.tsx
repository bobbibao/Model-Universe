'use client';

import { FormEvent, useState } from 'react';
import TextField, { inputClassName } from '@/components/FormElements/TextField';
import ReviewApi from '@/core/client/api/Review';

const RATING_LABELS = ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Rất tốt'];

const ReviewForm = ({ productId, onSubmitted }: { productId: number; onSubmitted: () => void }) => {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError('Vui lòng nhập tiêu đề đánh giá.');
      return;
    }
    setTitleError(undefined);
    setSubmitting(true);
    const created = await ReviewApi.createReview({ productId, rating, title: title.trim(), content: content.trim() });
    setSubmitting(false);
    if (created) onSubmitted();
  };

  return (
    <form
      onSubmit={submit}
      className="mb-8 flex flex-col gap-4 rounded-md border border-stroke p-5 dark:border-store-card"
      noValidate
    >
      <h3 className="text-lg font-semibold">Viết đánh giá của bạn</h3>
      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            aria-label={`${star} sao`}
            className={`text-3xl leading-none ${star <= rating ? 'text-brand-hover' : 'text-stroke dark:text-store-card'}`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-body dark:text-store-muted">{RATING_LABELS[rating - 1]}</span>
      </div>
      <TextField
        label="Tiêu đề"
        name="reviewTitle"
        maxLength={120}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={titleError}
      />
      <div>
        <label htmlFor="reviewContent" className="mb-2 block text-sm font-medium text-black dark:text-white">
          Nội dung
        </label>
        <textarea
          id="reviewContent"
          rows={4}
          maxLength={2000}
          className={inputClassName}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-brand px-6 py-2.5 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
      </button>
    </form>
  );
};

export default ReviewForm;
