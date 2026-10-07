'use client';

import { useCallback, useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumbs/Breadcrumb';
import { inputClassName } from '@/components/FormElements/TextField';
import AgentServerApi from '@/core/client/api/AgentServer';
import type { AgentCase } from '@/shared/types/agent';
import { OUTCOME_LABELS, VERDICT_LABELS, formatDateTime, kindLabel } from '../components/agentLabels';

// What the agent remembers: one case per finished improvement (decision, outcome, lessons), searched by meaning.
const Knowledge = () => {
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<AgentCase[]>();

  const load = useCallback(async (text: string) => setCases((await AgentServerApi.searchCases(text)) || []), []);

  useEffect(() => {
    load('');
  }, [load]);

  return (
    <>
      <Breadcrumb pageName="Tri thức của Agent" />
      <form
        className="mb-6 flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          load(query);
        }}
      >
        <input
          className={inputClassName}
          placeholder="Tìm tình huống tương tự, ví dụ: giảm giá hàng tồn lâu"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink hover:bg-brand-hover">Tìm</button>
      </form>
      {cases === undefined ? (
        <p className="text-body">Đang tải...</p>
      ) : cases.length === 0 ? (
        <p className="text-body">Chưa có tình huống nào.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cases.map((item) => (
            <article
              key={item.key}
              className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark"
            >
              <p className="mb-2 font-semibold">
                {kindLabel(item.kind)} ·{' '}
                {item.outcome ? OUTCOME_LABELS[item.outcome as keyof typeof OUTCOME_LABELS] || item.outcome : '—'}
                {item.verdict && ` · ${VERDICT_LABELS[item.verdict]}`}
              </p>
              {item.lessons.length > 0 && (
                <ul className="mb-2 list-disc pl-5 text-sm">
                  {item.lessons.map((lesson) => (
                    <li key={lesson}>{lesson}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-body">{formatDateTime(item.closedAt)}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
};

export default Knowledge;
