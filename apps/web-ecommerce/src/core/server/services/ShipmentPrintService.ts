import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js/node';
import { Op } from 'sequelize';
import DatabaseProvider from '../database/Database.Provider';
import OrderModel from '../database/client/models/Order.Model';
import OrderItemModel from '../database/client/models/OrderItem.Model';
import OrderShipmentModel from '../database/client/models/OrderShipment.Model';
import ShipmentPrintBatchModel, { LABEL_SIZES, type LabelSize } from '../database/client/models/ShipmentPrintBatch.Model';
import UserModel from '../database/internal/models/User.Model';
import HttpError from '../../../shared/server/utils/HttpError';
import { formatVND } from '../../../shared/server/utils/utils';
import { transferMemo } from '../../../shared/payment';
import ShippingService, { type ShippingOrigin } from './ShippingService';
import * as SuperAi from './delivery/SuperAiClient';

// Waybills whose parcel is still at the shop: their labels are what the end-of-day print run is for.
const AT_SHOP = ['CREATED', 'AWAITING_PICKUP'];
const VIEW_CONFIG_TEXT: Record<string, string> = {
  '1': 'Cho xem hàng, không cho thử',
  '2': 'Cho thử hàng',
  '3': 'Không cho xem hàng',
};
// Page sizes in PDF points (1 mm = 72 / 25.4 pt).
const MM = 72 / 25.4;
const PAGE: Record<LabelSize, [number, number]> = {
  A6: [105 * MM, 148 * MM],
  '100x150': [100 * MM, 150 * MM],
  A4: [210 * MM, 297 * MM],
};

const fontFile = (weight: '400Regular' | '700Bold') =>
  require.resolve(`@expo-google-fonts/be-vietnam-pro/${weight}/BeVietnamPro_${weight}.ttf`);

// The day (Asia/Ho_Chi_Minh) as a UTC range.
const vnDayRange = (day: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw HttpError.badRequest('Choose a day (YYYY-MM-DD).');
  const start = new Date(`${day}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
};

export interface LabelRow {
  shipmentId: number;
  orderId: number;
  orderCode: string;
  carrierName: string;
  carrierCode: string;
  superaiCode: string | null;
  mode: string;
  status: string;
  createdAt: Date;
  labelPrintedAt: Date | null;
  printCount: number;
  recipientName: string;
  phone: string;
  address: string;
  codAmountVnd: number;
  totalVnd: number;
  weightGram: number;
  note: string | null;
  items: { name: string; quantity: number }[];
}

// End-of-day label printing for staff: which parcels need a label, one PDF with a label per parcel (carrier, barcode,
// sender, receiver, COD, items), a CSV checklist, the carriers' own labels for live waybills, and a record of every
// print run. Orders that are paid but have no waybill yet are listed too, so nothing waits unnoticed.
export default class ShipmentPrintService {
  private shipping = new ShippingService();

  private async admin(actorUserId: number) {
    const actor = await UserModel.findByPk(actorUserId);
    if (!actor?.isActive || actor.role !== 'ADMIN') throw HttpError.forbidden();
  }

  private async rows(shipments: OrderShipmentModel[]): Promise<LabelRow[]> {
    const orders = await OrderModel.findAll({ where: { id: shipments.map((row) => row.orderId) } });
    const items = await OrderItemModel.findAll({ where: { orderId: shipments.map((row) => row.orderId) } });
    return shipments.map((shipment) => {
      const order = orders.find((row) => row.id === shipment.orderId)!;
      return {
        shipmentId: shipment.id,
        orderId: order.id,
        orderCode: transferMemo(order.id),
        carrierName: shipment.carrierName || shipment.carrier,
        carrierCode: shipment.carrierCode || shipment.trackingNumber || '',
        superaiCode: shipment.carrier === 'SUPERAI' ? shipment.trackingNumber : null,
        mode: shipment.mode,
        status: shipment.status,
        createdAt: shipment.createdAt,
        labelPrintedAt: shipment.labelPrintedAt,
        printCount: shipment.printCount,
        recipientName: order.recipientName,
        phone: order.phone,
        address: [order.address, order.ward, order.district, order.city].filter(Boolean).join(', '),
        codAmountVnd: shipment.codAmountVnd,
        totalVnd: order.total,
        weightGram: shipment.packageSnapshot?.weightGram ?? 0,
        note: order.note || null,
        items: items
          .filter((item) => item.orderId === order.id)
          .map((item) => ({ name: item.productName, quantity: item.quantity })),
      };
    });
  }

  // The print queue: waybills still at the shop (unprinted by default; or printed, or all) created on `day` (or any
  // day), and paid courier orders that still have no waybill.
  async queue(actorUserId: number, query: { day?: string; status?: string }) {
    await this.admin(actorUserId);
    const status = ['unprinted', 'printed', 'all'].includes(String(query.status)) ? String(query.status) : 'unprinted';
    const range = query.day ? vnDayRange(query.day) : null;
    const shipments = await OrderShipmentModel.findAll({
      where: {
        status: { [Op.in]: AT_SHOP },
        ...(status === 'unprinted' ? { labelPrintedAt: null } : status === 'printed' ? { labelPrintedAt: { [Op.ne]: null } } : {}),
        ...(range ? { createdAt: { [Op.gte]: range.start, [Op.lt]: range.end } } : {}),
      },
      order: [['id', 'ASC']],
      limit: 500,
    });
    const active = await OrderShipmentModel.findAll({
      attributes: ['orderId'],
      where: { status: { [Op.notIn]: ['CANCELLED', 'RETURNED'] } },
    });
    const withWaybill = new Set(active.map((row) => row.orderId));
    const paid = await OrderModel.findAll({
      where: {
        status: 'PROCESSING',
        fulfillmentMethod: 'COURIER_COD',
        prepaidVnd: { [Op.gt]: 0 },
      },
      order: [['id', 'ASC']],
      limit: 500,
    });
    const needsWaybill = paid
      .filter((order) => !withWaybill.has(order.id) && order.prepaidVnd >= order.upfrontDueVnd)
      .filter((order) => order.cancelRequest?.status !== 'PENDING')
      .map((order) => ({
        orderId: order.id,
        orderCode: transferMemo(order.id),
        recipientName: order.recipientName,
        address: [order.address, order.ward, order.district, order.city].filter(Boolean).join(', '),
        paidAt: order.updatedAt,
      }));
    const counts = {
      unprinted: await OrderShipmentModel.count({ where: { status: { [Op.in]: AT_SHOP }, labelPrintedAt: null } }),
      printed: await OrderShipmentModel.count({
        where: { status: { [Op.in]: AT_SHOP }, labelPrintedAt: { [Op.ne]: null } },
      }),
      needsWaybill: needsWaybill.length,
    };
    return { status, day: query.day || null, labels: await this.rows(shipments), needsWaybill, counts };
  }

  // A print run: the chosen waybills (still at the shop) are recorded as printed; the PDF and CSV are then downloaded.
  async createBatch(actorUserId: number, data: Record<string, unknown>) {
    await this.admin(actorUserId);
    const ids = Array.isArray(data.shipmentIds)
      ? [...new Set(data.shipmentIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
      : [];
    if (!ids.length || ids.length > 300) throw HttpError.badRequest('Choose from 1 to 300 labels to print.');
    const size = (LABEL_SIZES as readonly string[]).includes(String(data.size)) ? (data.size as LabelSize) : 'A6';
    return DatabaseProvider.getInstance().transaction(async (transaction) => {
      const shipments = await OrderShipmentModel.findAll({
        where: { id: ids },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (shipments.length !== ids.length) throw HttpError.notFound('A chosen waybill no longer exists.');
      const gone = shipments.filter((row) => !AT_SHOP.includes(row.status));
      if (gone.length)
        throw HttpError.conflict(
          `These waybills are no longer at the shop: ${gone.map((row) => transferMemo(row.orderId)).join(', ')}. Refresh the list.`,
          'LABEL_NOT_PRINTABLE',
        );
      const batch = await ShipmentPrintBatchModel.create(
        {
          createdByUserId: actorUserId,
          shipmentIds: ids,
          size,
          labelCount: ids.length,
          reprintCount: shipments.filter((row) => row.labelPrintedAt).length,
        },
        { transaction },
      );
      for (const shipment of shipments)
        await shipment.update(
          { labelPrintedAt: new Date(), printBatchId: batch.id, printCount: shipment.printCount + 1 },
          { transaction },
        );
      return batch;
    });
  }

  async batches(actorUserId: number) {
    await this.admin(actorUserId);
    const rows = await ShipmentPrintBatchModel.findAll({ order: [['id', 'DESC']], limit: 30 });
    const users = await UserModel.findAll({
      where: { id: [...new Set(rows.map((row) => row.createdByUserId))] },
      attributes: ['id', 'firstName', 'lastName', 'email'],
    });
    return rows.map((row) => {
      const user = users.find((item) => item.id === row.createdByUserId);
      return {
        id: row.id,
        size: row.size,
        labelCount: row.labelCount,
        reprintCount: row.reprintCount,
        createdAt: row.createdAt,
        createdBy: user ? `${user.lastName} ${user.firstName}`.trim() || user.email : null,
      };
    });
  }

  private async batchRows(actorUserId: number, batchId: number) {
    await this.admin(actorUserId);
    const batch = await ShipmentPrintBatchModel.findByPk(batchId);
    if (!batch) throw HttpError.notFound();
    const shipments = await OrderShipmentModel.findAll({ where: { id: batch.shipmentIds }, order: [['id', 'ASC']] });
    return { batch, rows: await this.rows(shipments) };
  }

  // The CSV checklist of a batch (opens in Excel: UTF-8 with BOM).
  async csv(actorUserId: number, batchId: number) {
    const { rows } = await this.batchRows(actorUserId, batchId);
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Mã đơn', 'Đơn vị vận chuyển', 'Mã vận đơn', 'Người nhận', 'Điện thoại', 'Địa chỉ', 'Thu hộ (VND)', 'Sản phẩm', 'Ghi chú'],
      ...rows.map((row) => [
        row.orderCode,
        row.carrierName,
        row.carrierCode,
        row.recipientName,
        row.phone,
        row.address,
        row.codAmountVnd,
        row.items.map((item) => `${item.name} x${item.quantity}`).join('; '),
        row.note,
      ]),
    ];
    return `${String.fromCharCode(0xfeff)}${lines.map((line) => line.map(cell).join(',')).join('\r\n')}\r\n`;
  }

  // The carriers' own labels for the batch's live SuperAI waybills.
  async carrierLabels(actorUserId: number, batchId: number) {
    const { rows } = await this.batchRows(actorUserId, batchId);
    const codes = rows.filter((row) => row.mode === 'live' && row.superaiCode).map((row) => row.superaiCode!);
    if (!codes.length) return { url: null, count: 0 };
    return { url: await SuperAi.labelUrl(codes, 'S9'), count: codes.length };
  }

  // One PDF: a label per parcel (A6 or 100×150 mm thermal), or four per A4 sheet.
  async pdf(actorUserId: number, batchId: number): Promise<Buffer> {
    const { batch, rows } = await this.batchRows(actorUserId, batchId);
    const origin = await this.shipping.origin();
    const [pageWidth, pageHeight] = PAGE[batch.size];
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: 0, autoFirstPage: false });
    doc.info.Title = `Nhãn giao hàng – đợt in #${batch.id}`;
    doc.registerFont('regular', fontFile('400Regular'));
    doc.registerFont('bold', fontFile('700Bold'));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    const cell: [number, number] = batch.size === 'A4' ? [pageWidth / 2, pageHeight / 2] : [pageWidth, pageHeight];
    for (const [index, row] of rows.entries()) {
      const slot = batch.size === 'A4' ? index % 4 : 0;
      if (slot === 0) doc.addPage({ size: [pageWidth, pageHeight], margin: 0 });
      const x = batch.size === 'A4' ? (slot % 2) * cell[0] : 0;
      const y = batch.size === 'A4' ? Math.floor(slot / 2) * cell[1] : 0;
      await this.drawLabel(doc, row, origin, x, y, cell[0], cell[1]);
    }
    if (!rows.length) doc.addPage().font('regular').fontSize(10).text('Không có nhãn nào.', 20, 20);
    doc.end();
    return done;
  }

  private async drawLabel(
    doc: PDFKit.PDFDocument,
    row: LabelRow,
    origin: ShippingOrigin | null,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const pad = 12;
    const inner = width - pad * 2;
    let cursor = y + pad;
    doc.save();
    doc.rect(x + 4, y + 4, width - 8, height - 8).lineWidth(0.8).stroke('#000');
    // Carrier and test marker.
    doc.font('bold').fontSize(15).fillColor('#000').text(row.carrierName, x + pad, cursor, { width: inner * 0.7 });
    if (row.mode !== 'live')
      doc.font('bold').fontSize(8).text('MÔ PHỎNG – KHÔNG GỬI', x + pad + inner * 0.55, cursor + 4, {
        width: inner * 0.45,
        align: 'right',
      });
    cursor += 22;
    // The carrier's waybill code as a Code 128 barcode.
    if (row.carrierCode) {
      const barcode = await bwipjs.toBuffer({
        bcid: 'code128',
        text: row.carrierCode,
        scale: 3,
        height: 12,
        includetext: false,
      });
      doc.image(barcode, x + pad, cursor, { width: inner, height: 46 });
      cursor += 49;
      doc.font('bold').fontSize(11).text(row.carrierCode, x + pad, cursor, { width: inner, align: 'center' });
      cursor += 16;
    }
    const section = (title: string, lines: string[], size = 8.5) => {
      doc.moveTo(x + pad, cursor).lineTo(x + width - pad, cursor).lineWidth(0.5).stroke('#000');
      cursor += 4;
      doc.font('bold').fontSize(7.5).text(title, x + pad, cursor, { width: inner });
      cursor += 10;
      for (const [index, line] of lines.entries()) {
        doc.font(index === 0 ? 'bold' : 'regular').fontSize(index === 0 ? size + 1 : size);
        doc.text(line, x + pad, cursor, { width: inner });
        cursor = doc.y + 1;
      }
      cursor += 3;
    };
    section('NGƯỜI GỬI', [
      origin?.warehouseName || 'MODEL universe',
      [origin?.phone, origin?.address].filter(Boolean).join(' · '),
    ], 7.5);
    section('NGƯỜI NHẬN', [`${row.recipientName} · ${row.phone}`, row.address], 9);
    // Money to collect: the most important line for the courier.
    doc.moveTo(x + pad, cursor).lineTo(x + width - pad, cursor).lineWidth(0.5).stroke('#000');
    cursor += 5;
    doc
      .font('bold')
      .fontSize(13)
      .text(
        row.codAmountVnd > 0 ? `THU HỘ: ${formatVND(row.codAmountVnd, 'vi')}` : 'ĐÃ THANH TOÁN – KHÔNG THU TIỀN',
        x + pad,
        cursor,
        { width: inner },
      );
    cursor += 20;
    section(
      `ĐƠN ${row.orderCode} · ${row.weightGram ? `${(row.weightGram / 1000).toFixed(1)} kg` : ''}`,
      [
        row.items.map((item) => `${item.quantity} × ${item.name}`).join('\n'),
        origin ? VIEW_CONFIG_TEXT[origin.viewConfig] : '',
        row.note ? `Ghi chú: ${row.note}` : '',
      ].filter(Boolean),
      7.5,
    );
    // The shop's order code, for scanning at packing and returns.
    const orderBarcode = await bwipjs.toBuffer({ bcid: 'code128', text: row.orderCode, scale: 2, height: 6 });
    const bottom = y + height - pad - 26;
    if (cursor < bottom) {
      doc.image(orderBarcode, x + pad, bottom, { width: inner * 0.5, height: 20 });
      doc
        .font('regular')
        .fontSize(6.5)
        .text(row.superaiCode ? `SuperAI ${row.superaiCode}` : '', x + pad + inner * 0.52, bottom + 6, {
          width: inner * 0.48,
          align: 'right',
        });
    }
    doc.restore();
  }
}
