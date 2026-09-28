'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import Modal from '@/components/Modal/Modal';
import ConfirmModal from '@/components/Modal/ConfirmModal';
import TextField from '@/components/FormElements/TextField';
import CategoryApi from '@/core/client/api/Category';
import { toSlug } from '@/shared/client/utils/toSlug';
import type { Category } from '@/shared/types/product';

type EditingCategory = { id?: number; name: string; slug: string };

const CategoryList = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingCategory | null>(null);
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setCategories((await CategoryApi.getAdminCategories()) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openEditor = (category?: Category) => {
    setNameError(undefined);
    setEditing(category ? { id: category.id, name: category.name, slug: category.slug } : { name: '', slug: '' });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) {
      setNameError('Vui lòng nhập tên danh mục.');
      return;
    }
    setSaving(true);
    const input = { name: editing.name.trim(), slug: editing.slug.trim() || undefined };
    const saved = editing.id
      ? await CategoryApi.updateCategory(editing.id, input)
      : await CategoryApi.createCategory(input);
    setSaving(false);
    if (saved) {
      setEditing(null);
      loadCategories();
    }
  };

  const remove = async () => {
    if (deleting && (await CategoryApi.deleteCategory(deleting.id))) loadCategories();
    setDeleting(null);
  };

  const columns: DataTableColumn<Category>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Tên danh mục' },
    { key: 'slug', header: 'Đường dẫn' },
    { key: 'productCount', header: 'Số sản phẩm' },
    {
      key: 'actions',
      header: '',
      render: (category) => (
        <div className="flex justify-end gap-4">
          <button onClick={() => openEditor(category)} className="font-medium text-brand-hover hover:underline">
            Sửa
          </button>
          <button onClick={() => setDeleting(category)} className="font-medium text-danger hover:underline">
            Xoá
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Breadcrumb pageName="Danh mục" />
      <DataTable
        title="Danh sách danh mục"
        actions={
          <button
            onClick={() => openEditor()}
            className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
          >
            + Thêm danh mục
          </button>
        }
        columns={columns}
        data={categories}
        rowKey={(category) => category.id}
        loading={loading}
        emptyText="Chưa có danh mục nào"
      />

      <Modal open={!!editing} title={editing?.id ? 'Sửa danh mục' : 'Thêm danh mục'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="flex flex-col gap-4" noValidate>
            <TextField
              label="Tên danh mục"
              name="name"
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              error={nameError}
              autoFocus
            />
            <TextField
              label="Đường dẫn (để trống để tạo tự động)"
              name="slug"
              placeholder={toSlug(editing.name)}
              value={editing.slug}
              onChange={(event) => setEditing({ ...editing, slug: event.target.value })}
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 font-medium text-body hover:underline"
              >
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
        )}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title="Xoá danh mục"
        message={
          <>
            Bạn có chắc muốn xoá danh mục <strong>{deleting?.name}</strong>? Chỉ có thể xoá danh mục chưa có sản phẩm.
          </>
        }
        confirmLabel="Xoá"
        danger
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
};

export default CategoryList;
