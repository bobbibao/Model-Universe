'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import Stepper from '@/components/Stepper/Stepper';
import SelectField from '@/components/FormElements/SelectField';
import { inputClassName } from '@/components/FormElements/TextField';
import StockImportApi from '@/core/client/api/StockImport';
import SupplierApi, { SupplierOption } from '@/core/client/api/Supplier';
import { formatVND } from '@/shared/server/utils/utils';
import ProductPicker, { PickedProduct } from '../components/ProductPicker';
import StockImportHistory from '../components/StockImportHistory';

const STEPS = ['Chọn sản phẩm và số lượng', 'Nhà cung cấp', 'Xác nhận thông tin'];
const STEP_HINTS = [
  'Chọn các sản phẩm cần nhập, số lượng và giá nhập của từng sản phẩm.',
  'Chọn nhà cung cấp của lô hàng và ghi chú (nếu có).',
  'Kiểm tra lại thông tin trước khi hoàn thành. Tồn kho sẽ được cộng thêm ngay khi lưu.',
];

interface ImportLine {
  key: number;
  product: PickedProduct | null;
  quantity: string;
  importPrice: string;
}

let nextLineKey = 1;
const emptyLine = (): ImportLine => ({ key: nextLineKey++, product: null, quantity: '1', importPrice: '' });

const validateLines = (lines: ImportLine[]): string[] =>
  lines.flatMap((line, index) => {
    const errors: string[] = [];
    if (!line.product) errors.push(`Dòng ${index + 1}: vui lòng chọn sản phẩm.`);
    if (!/^\d+$/.test(line.quantity) || Number(line.quantity) < 1)
      errors.push(`Dòng ${index + 1}: số lượng phải từ 1.`);
    if (!/^\d+$/.test(line.importPrice)) errors.push(`Dòng ${index + 1}: vui lòng nhập giá nhập.`);
    return errors;
  });

const StockImport = () => {
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<ImportLine[]>([emptyLine()]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    SupplierApi.getSupplierOptions().then(setSuppliers);
  }, []);

  const updateLine = (key: number, changes: Partial<ImportLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)));

  const reset = () => {
    setStep(0);
    setLines([emptyLine()]);
    setSupplierId('');
    setNote('');
    setErrors([]);
  };

  const next = () => {
    const stepErrors =
      step === 0 ? validateLines(lines) : step === 1 && !supplierId ? ['Vui lòng chọn nhà cung cấp.'] : [];
    setErrors(stepErrors);
    if (stepErrors.length === 0) setStep(step + 1);
  };

  const finish = async () => {
    setSaving(true);
    const created = await StockImportApi.createStockImport({
      supplierId: Number(supplierId),
      note,
      items: lines.map((line) => ({
        productId: (line.product as PickedProduct).id,
        quantity: Number(line.quantity),
        importPrice: Number(line.importPrice),
      })),
    });
    setSaving(false);
    if (created) {
      reset();
      setHistoryKey((key) => key + 1);
    }
  };

  const supplier = suppliers.find((option) => String(option.id) === supplierId);
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.importPrice || 0), 0);

  return (
    <>
      <Breadcrumb pageName="Nhập kho" />
      <div className="mb-8 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-8">
        <div className="mb-4">
          <Stepper steps={STEPS} currentStep={step} />
        </div>
        <p className="mb-6 text-body">{STEP_HINTS[step]}</p>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            {lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-1 items-end gap-3 md:grid-cols-12">
                <div className="md:col-span-6">
                  {index === 0 && <label className="mb-2 block text-sm font-medium">Sản phẩm</label>}
                  <ProductPicker
                    value={line.product}
                    excludeIds={lines.flatMap((other) =>
                      other.key !== line.key && other.product ? [other.product.id] : [],
                    )}
                    onChange={(product) =>
                      updateLine(line.key, {
                        product,
                        importPrice: line.importPrice || String(product.importPrice ?? 0),
                      })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  {index === 0 && <label className="mb-2 block text-sm font-medium">Số lượng</label>}
                  <input
                    className={inputClassName}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <div className="md:col-span-3">
                  {index === 0 && <label className="mb-2 block text-sm font-medium">Giá nhập (VND)</label>}
                  <input
                    className={inputClassName}
                    inputMode="numeric"
                    value={line.importPrice}
                    onChange={(event) => updateLine(line.key, { importPrice: event.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((other) => other.key !== line.key))}
                  className="rounded border border-danger px-3 py-3 text-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-40 md:col-span-1"
                  aria-label={`Xoá dòng ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLines([...lines, emptyLine()])}
              className="self-start font-medium text-brand-hover hover:underline"
            >
              + Thêm sản phẩm
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <SelectField
              label="Nhà cung cấp"
              name="supplierId"
              placeholder="Chọn nhà cung cấp"
              options={suppliers.map((option) => ({
                value: String(option.id),
                label: `${option.id} - ${option.name}`,
              }))}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            />
            <div className="md:col-span-2">
              <label htmlFor="note" className="mb-2 block text-sm font-medium">
                Ghi chú
              </label>
              <textarea
                id="note"
                rows={3}
                maxLength={500}
                className={inputClassName}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-stroke text-sm text-body dark:border-strokedark">
                    <th className="py-2">ID</th>
                    <th className="py-2">Tên sản phẩm</th>
                    <th className="py-2 text-right">Số lượng</th>
                    <th className="py-2 text-right">Giá nhập</th>
                    <th className="py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-b border-stroke dark:border-strokedark">
                      <td className="py-2">{line.product?.id}</td>
                      <td className="py-2">{line.product?.name}</td>
                      <td className="py-2 text-right">{line.quantity}</td>
                      <td className="py-2 text-right">{formatVND(Number(line.importPrice))}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatVND(Number(line.quantity) * Number(line.importPrice))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p>
                  <span className="text-body">Nhà cung cấp:</span> {supplier?.id} - {supplier?.name}
                </p>
                {supplier?.contactPhone && (
                  <p>
                    <span className="text-body">Số điện thoại:</span> {supplier.contactPhone}
                  </p>
                )}
                {note && (
                  <p>
                    <span className="text-body">Ghi chú:</span> {note}
                  </p>
                )}
              </div>
              <p className="text-xl font-bold text-black dark:text-white">Tổng giá trị: {formatVND(total)}</p>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <ul className="mt-5 list-inside list-disc text-sm text-danger">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={reset} className="rounded-md px-4 py-2 font-medium text-body hover:underline">
            Thoát
          </button>
          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={saving}
                className="rounded-md border border-stroke px-5 py-2 font-medium dark:border-strokedark"
              >
                Quay lại
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
              >
                Tiếp
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
              >
                {saving ? 'Đang lưu...' : 'Hoàn thành'}
              </button>
            )}
          </div>
        </div>
      </div>

      <StockImportHistory refreshKey={historyKey} />
    </>
  );
};

export default StockImport;
