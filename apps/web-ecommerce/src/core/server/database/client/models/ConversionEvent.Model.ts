import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type ConversionPlatform = 'meta' | 'google' | 'tiktok';
export type ConversionStatus = 'sent' | 'fake' | 'skipped' | 'failed';

// A server-side purchase event sent for an order (docs/GROWTH_AGENT.md section 6): Meta Conversions API, TikTok
// Events API, or a Google Ads offline conversion. `eventId` is the order id, shared with the browser event so the
// platforms count the purchase once. `payload` is what was sent (no raw customer data: identifiers are hashed and only
// present with consent). analytics.conversion_stats counts these per platform for the bidding rule.
@Table({
  tableName: 'conversion_event',
  indexes: [{ unique: true, fields: ['orderId', 'platform'] }],
})
export default class ConversionEventModel extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  orderId!: number;

  @Column({ type: DataType.STRING, allowNull: false })
  platform!: ConversionPlatform;

  @Column({ type: DataType.STRING, allowNull: false })
  eventId!: string;

  // sent (live), fake (CONVERSIONS_MODE=fake), skipped (nothing the platform can match), failed (see error).
  @Column({ type: DataType.STRING, allowNull: false })
  status!: ConversionStatus;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  payload!: Record<string, unknown>;

  @Column(DataType.TEXT)
  error?: string | null;

  // Written when orders are placed; nothing is seeded.
  public static async seedData(): Promise<void> {}
}
