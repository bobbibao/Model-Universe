import axios, { AxiosError, type AxiosInstance } from 'axios';
import { PlatformError, type FacebookPageClient, type PagePost, type PostTotals } from './types';

// The shop's Facebook Page through the Graph API (FACEBOOK_PAGE_MODE=live). The version is pinned
// (META_GRAPH_API_VERSION, default v24.0, the facebook-nodejs-business-sdk 24.x line). A post with an image is a
// photo post (the link goes at the end of the caption); a post without one is a link post. Scheduling uses
// `published: false` with `scheduled_publish_time` (at least 10 minutes ahead; the API's own limit).
// Metric names are the Page post insights the API documents for this version; docs/MARKETING_LIVE_CHECKLIST.md
// has the check to run before going live.
export const POST_METRICS = ['post_media_view', 'post_total_media_view_unique', 'post_clicks'] as const;

export class FacebookGraphPage implements FacebookPageClient {
  readonly mode = 'live' as const;
  private readonly http: AxiosInstance;

  constructor(
    private readonly pageId: string,
    private readonly accessToken: string,
    version = 'v24.0',
  ) {
    this.http = axios.create({ baseURL: `https://graph.facebook.com/${version}`, timeout: 20_000 });
  }

  private async call<T>(request: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await request()).data;
    } catch (error) {
      const response = (error as AxiosError<{ error?: { message?: string; is_transient?: boolean } }>).response;
      const status = response?.status ?? 0;
      const message = response?.data?.error?.message ?? (error as Error).message;
      throw new PlatformError(
        'facebook',
        message,
        status === 0 || status >= 500 || !!response?.data?.error?.is_transient,
      );
    }
  }

  async publish(post: PagePost): Promise<{ externalId: string }> {
    const schedule = post.scheduledAt
      ? { published: false, scheduled_publish_time: Math.floor(post.scheduledAt.getTime() / 1000) }
      : {};
    if (post.imageUrl) {
      const caption = post.link ? `${post.message}\n${post.link}` : post.message;
      const data = await this.call<{ id: string; post_id?: string }>(() =>
        this.http.post(`/${this.pageId}/photos`, {
          url: post.imageUrl,
          caption,
          ...schedule,
          access_token: this.accessToken,
        }),
      );
      return { externalId: data.post_id ?? data.id };
    }
    const data = await this.call<{ id: string }>(() =>
      this.http.post(`/${this.pageId}/feed`, {
        message: post.message,
        ...(post.link ? { link: post.link } : {}),
        ...schedule,
        access_token: this.accessToken,
      }),
    );
    return { externalId: data.id };
  }

  async remove(externalId: string): Promise<void> {
    await this.call(() => this.http.delete(`/${externalId}`, { params: { access_token: this.accessToken } }));
  }

  async totals(externalId: string): Promise<PostTotals> {
    const data = await this.call<{
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
      insights?: { data?: { name: string; values?: { value?: number }[] }[] };
    }>(() =>
      this.http.get(`/${externalId}`, {
        params: {
          fields: `reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares,insights.metric(${POST_METRICS.join(',')})`,
          access_token: this.accessToken,
        },
      }),
    );
    const metric = (name: string) => Number(data.insights?.data?.find((m) => m.name === name)?.values?.[0]?.value ?? 0);
    return {
      impressions: metric('post_media_view'),
      reach: metric('post_total_media_view_unique'),
      clicks: metric('post_clicks'),
      engagements:
        Number(data.reactions?.summary?.total_count ?? 0) +
        Number(data.comments?.summary?.total_count ?? 0) +
        Number(data.shares?.count ?? 0),
    };
  }
}
