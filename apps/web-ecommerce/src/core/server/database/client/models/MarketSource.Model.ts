import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type MarketSourceStatus = 'ok' | 'degraded' | 'blocked' | 'off';

// Health of one market-data source (trends, competitor_sites, fixture), reported by the agent's collectors with every
// `POST /market/observations`. `blocked` means the source stopped itself (e.g. a CAPTCHA page); an admin decides.
@Table({
  tableName: 'market_source',
})
export default class MarketSourceModel extends Model {
  @Column({ type: DataType.STRING, primaryKey: true })
  name!: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'ok' })
  status!: MarketSourceStatus;

  @Column(DataType.TEXT)
  detail?: string | null;

  @Column(DataType.DATE)
  lastRunAt?: Date | null;

  @Column(DataType.DATE)
  lastSuccessAt?: Date | null;

  public static async seedData(): Promise<void> {}
}
