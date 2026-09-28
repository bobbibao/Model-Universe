'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import DataTable, { DataTableColumn } from '@/components/Tables/DataTable';
import Modal from '@/components/Modal/Modal';
import { inputClassName } from '@/components/FormElements/TextField';
import ContactApi from '@/core/client/api/Contact';
import type { Pagination } from '@/shared/types/pagination';
import type { ContactMessage, ContactMessageStatus } from '@/shared/types/contact';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;
const PREVIEW_LENGTH = 80;

const StatusBadge = ({ status }: { status: ContactMessageStatus }) => (
  <span
    className={`rounded-full px-3 py-1 text-xs font-medium ${
      status === 'NEW' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
    }`}
  >
    {status === 'NEW' ? 'Mới' : 'Đã xử lý'}
  </span>
);

const ContactMessageList = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [pagination, setPagination] = useState<Pagination>();
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContactMessageStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ContactMessage | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await ContactApi.getMessages({ q: search, status, page, per_page: PAGE_SIZE });
    setMessages(result?.data || []);
    setPagination(result?.pagination);
    setLoading(false);
  }, [search, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (message: ContactMessage) => {
    const updated = await ContactApi.updateStatus(message.id, message.status === 'NEW' ? 'HANDLED' : 'NEW');
    if (updated) {
      setMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelected((current) => (current?.id === updated.id ? updated : current));
    }
  };

  const columns: DataTableColumn<ContactMessage>[] = [
    { key: 'createdAt', header: 'Ngày gửi', render: (message) => new Date(message.createdAt).toLocaleString('vi-VN') },
    {
      key: 'name',
      header: 'Người gửi',
      render: (message) => (
        <div>
          <p className="font-medium">{message.name}</p>
          <p className="text-sm text-body">{message.email}</p>
        </div>
      ),
    },
    {
      key: 'message',
      header: 'Nội dung',
      className: 'min-w-[260px]',
      render: (message) =>
        message.message.length > PREVIEW_LENGTH ? `${message.message.slice(0, PREVIEW_LENGTH)}…` : message.message,
    },
    { key: 'status', header: 'Trạng thái', render: (message) => <StatusBadge status={message.status} /> },
  ];

  return (
    <>
      <Breadcrumb pageName="Liên hệ" />
      <DataTable
        title="Tin nhắn liên hệ"
        actions={
          <>
            <input
              className={`${inputClassName} !py-2 sm:w-64`}
              placeholder="Tìm theo tên, email, nội dung..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
              className={`${inputClassName} !py-2 sm:w-40`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ContactMessageStatus | '');
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              <option value="NEW">Mới</option>
              <option value="HANDLED">Đã xử lý</option>
            </select>
          </>
        }
        columns={columns}
        data={messages}
        rowKey={(message) => message.id}
        loading={loading}
        emptyText="Chưa có tin nhắn nào"
        onRowClick={setSelected}
        pagination={pagination}
        onPageChange={setPage}
      />

      <Modal
        open={!!selected}
        title={`Tin nhắn từ ${selected?.name}`}
        onClose={() => setSelected(null)}
        size="lg"
        footer={
          selected && (
            <button
              onClick={() => toggleStatus(selected)}
              className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover"
            >
              {selected.status === 'NEW' ? 'Đánh dấu đã xử lý' : 'Đánh dấu chưa xử lý'}
            </button>
          )
        }
      >
        {selected && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="text-body">Email:</span>{' '}
              <a href={`mailto:${selected.email}`} className="text-brand-hover hover:underline">
                {selected.email}
              </a>
            </p>
            {selected.phone && (
              <p>
                <span className="text-body">Số điện thoại:</span> {selected.phone}
              </p>
            )}
            {selected.company && (
              <p>
                <span className="text-body">Công ty:</span> {selected.company}
              </p>
            )}
            <p>
              <span className="text-body">Ngày gửi:</span> {new Date(selected.createdAt).toLocaleString('vi-VN')} ·{' '}
              <StatusBadge status={selected.status} />
            </p>
            <p className="mt-3 whitespace-pre-line rounded-md bg-gray-2 p-4 dark:bg-meta-4">{selected.message}</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ContactMessageList;
