'use client';

import Api from './Api';
import { REVIEW_API } from './endpoint';

export interface ReviewInput {
  productId: number;
  rating: number;
  title: string;
  content: string;
}

export default class ReviewApi {
  static async getEligibility(productId: number): Promise<{ canReview: boolean; reason?: string } | undefined> {
    try {
      const response = await Api.get(REVIEW_API.GET_ELIGIBILITY(productId));
      return response.data;
    } catch (error) {
      return undefined;
    }
  }

  static async createReview(input: ReviewInput): Promise<boolean> {
    try {
      await Api.post(REVIEW_API.CREATE_REVIEW, input);
      return true;
    } catch (error) {
      return false;
    }
  }
}
