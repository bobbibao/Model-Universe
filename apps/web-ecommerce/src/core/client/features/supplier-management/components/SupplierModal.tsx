'use client';

import { FormEvent, useEffect, useState } from 'react';
import Modal from '@/components/Modal/Modal';
import TextField from '@/components/FormElements/TextField';
import SupplierApi, { SupplierInput } from '@/core/client/api/Supplier';
import type { Supplier } from '@/shared/types/product';

const emptySupplier: SupplierInput = {
  name: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  website: '',
  logo: '',
  isActive: true,
};

interface SupplierModalProps {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}

// Create (supplier = null) or edit a supplier.
const SupplierModal = ({ open, supplier, onClose, onSaved }: SupplierModalProps) => {
  const [values, setValues] = useState<SupplierInput>(emptySupplier);
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameError(undefined);
    setValues(
      supplier
        ? {
            name: supplier.name,
            contactName: supplier.contactName || '',
            contactPhone: supplier.contactPhone || '',
            contactEmail: supplier.contactEmail || '',
            website: supplier.website || '',
            logo: supplier.logo || '',
            isActive: supplier.isActive,
          }
        : emptySupplier,
    );
  }, [open, supplier]);

  const update = (key: keyof SupplierInput) => (value: string | boolean) => setValues({ ...values, [key]: value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!values.name.trim()) {
      setNameError('Vui lòng nhập tên nhà cung cấp.');
      return;
    }
    setSaving(true);
    const saved = supplier
      ? await SupplierApi.updateSupplier(supplier.id, values)
      : await SupplierApi.createSupplier(values);
    setSaving(false);
    if (saved) onSaved();
  };

  return (
    <Modal open={open} title={supplier ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'} onClose={onClose} size="lg">
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <TextField
          label="Tên nhà cung cấp"
          name="name"
          className="sm:col-span-2"
          value={values.name}
          onChange={(event) => update('name')(event.target.value)}
          error={nameError}
        />
        <TextField
          label="Người liên hệ"
          name="contactName"
          value={values.contactName || ''}
          onChange={(event) => update('contactName')(event.target.value)}
        />
        <TextField
          label="Số điện thoại"
          name="contactPhone"
          type="tel"
          value={values.contactPhone || ''}
          onChange={(event) => update('contactPhone')(event.target.value)}
        />
        <TextField
          label="Email"
          name="contactEmail"
          type="email"
          value={values.contactEmail || ''}
          onChange={(event) => update('contactEmail')(event.target.value)}
        />
        <TextField
          label="Website"
          name="website"
          placeholder="https://"
          value={values.website || ''}
          onChange={(event) => update('website')(event.target.value)}
        />
        <label className="flex items-center gap-3 font-medium text-black dark:text-white sm:col-span-2">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-hover"
            checked={values.isActive}
            onChange={(event) => update('isActive')(event.target.checked)}
          />
          Đang hợp tác (hiển thị khi chọn nhà cung cấp cho sản phẩm)
        </label>
        <div className="flex justify-end gap-3 sm:col-span-2">
          <button type="button" onClick={onClose} className="px-4 py-2 font-medium text-body hover:underline">
            Huỷ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SupplierModal;
