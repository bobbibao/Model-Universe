import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { DEFAULT_CARTONS } from '../../../../../shared/packing/rules';

// A carton size the shop packs orders in (the package optimizer chooses among the active ones). Inner sizes hold the
// goods; outer sizes are what the carrier measures. Whole centimetres, grams and VND.
@Table({ tableName: 'shipping_carton', indexes: [{ unique: true, fields: ['code'] }] })
export default class ShippingCartonModel extends Model {
  @Column({ type: DataType.STRING(32), allowNull: false }) code!: string;
  @Column({ type: DataType.STRING(80), allowNull: false }) name!: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) innerLengthCm!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) innerWidthCm!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) innerHeightCm!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) outerLengthCm!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) outerWidthCm!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) outerHeightCm!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) tareWeightGram!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) costVnd!: number;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 20_000 }) maxLoadGram!: number;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) active!: boolean;

  // The starting catalog, added once (staff then edit sizes and prices).
  public static async seedData(): Promise<void> {
    if (await ShippingCartonModel.count()) return;
    await ShippingCartonModel.bulkCreate(DEFAULT_CARTONS.map((carton) => ({ ...carton, active: true })));
  }
}
