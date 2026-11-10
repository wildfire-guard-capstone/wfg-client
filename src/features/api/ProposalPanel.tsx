import { useEffect, useState } from 'react';
import type { Evidence, Proposal, ProposalBlock } from '../../api';
import type { IncidentContext } from './types';
import { date, display, useResource } from './hooks';
import { Dialog, Empty, Feedback, Fields, Pager } from './ui';

const CATEGORY: Record<string, string> = {
  IMMEDIATE: '즉시',
  STANDBY: '대기',
  CONSULT: '협의',
  REQUEST: '요청',
};
function Marked({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, i) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
    </>
  );
}
function Block({
  block,
  evidence,
}: {
  block: ProposalBlock;
  evidence: (ids?: string[]) => void;
}) {
  switch (block.type) {
    case 'paragraph':
      return (
        <div className="api-proposal-paragraph">
          <b className="api-badge">
            {CATEGORY[block.category] ?? block.category}
          </b>
          <p>{block.body}</p>
          {block.cite && (
            <button onClick={() => evidence(block.evidence)}>
              {block.cite}
            </button>
          )}
          {block.quote && <blockquote>{block.quote}</blockquote>}
        </div>
      );
    case 'list':
      return block.style === 'numbered' ? (
        <ol>
          {block.rows.map((r, i) => (
            <li key={i}>
              <Marked text={r.text} />
            </li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.rows.map((r, i) => (
            <li key={i}>
              <Marked text={r.text} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="api-scroll">
          <table>
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j}>
                      <Marked text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'note':
    case 'failed':
      return (
        <p className={block.type === 'failed' ? 'api-error' : 'api-note'}>
          {block.text}
        </p>
      );
    default:
      return <p className="api-note">지원하지 않는 본문 형식입니다.</p>;
  }
}

export function EvidenceView({ items }: { items: Evidence[] }) {
  return (
    <>
      {items.length ? (
        items.map((e, i) => (
          <article className="api-section" key={`${e.chunk_id}-${i}`}>
            <h3>{display(e.doc_name)}</h3>
            <p>
              {display(e.label)} · {display(e.section)} ·{' '}
              {e.page == null ? '쪽 정보 없음' : `p.${e.page}`} ·{' '}
              {display(e.origin)}
            </p>
            <p className="api-prewrap">{display(e.text)}</p>
          </article>
        ))
      ) : (
        <Empty>근거 원문 정보가 없습니다.</Empty>
      )}
    </>
  );
}

export function ProposalPanel({ api, incident }: IncidentContext) {
  const path = { incident_id: incident.id };
  const [selected, setSelected] = useState<string | null>(null),
    [axis, setAxis] = useState<'SUPPRESSION' | 'EVACUATION'>('SUPPRESSION');
  const [filter, setFilter] = useState('all'),
    [cursor, setCursor] = useState<(string | undefined)[]>([undefined]);
  const [evidence, setEvidence] = useState<Evidence[] | null>(null),
    [showDiff, setShowDiff] = useState(false);
  const latest = useResource(
    (signal) => api.proposals.latest({ path, signal }),
    [incident.id, incident.latest_proposal_id],
  );
  const versions = useResource(
    (signal) =>
      api.proposals.list({
        path,
        query: { cursor: cursor.at(-1), limit: 10 },
        signal,
      }),
    [incident.id, incident.latest_proposal_id, cursor.at(-1)],
  );
  const version = useResource(
    (signal) =>
      api.proposals.get({ path: { ...path, proposal_id: selected! }, signal }),
    [incident.id, selected],
    !!selected,
  );
  const proposal = selected ? version.data : latest.data;
  const diff = useResource(
    (signal) =>
      api.proposals.diff({
        path: { ...path, proposal_id: proposal!.id },
        signal,
      }),
    [incident.id, proposal?.id, showDiff],
    showDiff && !!proposal,
  );
  useEffect(() => {
    setSelected(null);
    setShowDiff(false);
  }, [incident.latest_proposal_id]);
  return (
    <>
      <h2>대응 제안서</h2>
      {incident.proposal_stale && (
        <p className="api-warn">
          저장된 정정이 아직 제안서에 반영되지 않았습니다. AI·상황 정정에서
          재생성을 요청할 수 있습니다.
        </p>
      )}
      <Feedback {...(selected ? version : latest)}>
        {proposal ? (
          <>
            <Fields
              values={[
                ['버전', proposal.version],
                ['예측 기준', date(proposal.base_at)],
                ['판정 단계', proposal.judged_stage],
                ['예측 단계', proposal.predicted_stage],
                ['생성 계기', proposal.trigger],
              ]}
            />
            <div className="api-row">
              <button
                className={axis === 'SUPPRESSION' ? 'primary' : ''}
                onClick={() => setAxis('SUPPRESSION')}
              >
                진화 (S1~S6)
              </button>
              <button
                className={axis === 'EVACUATION' ? 'primary' : ''}
                onClick={() => setAxis('EVACUATION')}
              >
                대피 (E1~E6)
              </button>
              <label>
                구분{' '}
                <select
                  aria-label="제안 구분"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">전체</option>
                  {Object.entries(CATEGORY).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {proposal.items
              .filter(
                (i) =>
                  i.axis === axis &&
                  (filter === 'all' || i.categories.includes(filter as never)),
              )
              .map((item) => (
                <details
                  className="api-proposal-card"
                  key={item.item_code}
                  open={item.state !== 'NOT_TRIGGERED'}
                >
                  <summary>
                    <b>
                      {item.item_code} · {item.name}
                    </b>
                    <span>
                      {item.state === 'NOT_TRIGGERED'
                        ? '해당 없음'
                        : item.state}
                    </span>
                  </summary>
                  <div className="api-card-content">
                    <p>
                      {item.finding ||
                        '발동하지 않은 항목입니다. 안전함을 의미하지 않습니다.'}
                    </p>
                    {item.withheld?.map((w, i) => (
                      <p className="api-note" key={i}>
                        {w.field}: {w.reason}
                      </p>
                    ))}
                    {item.sections.map((s, i) => (
                      <section key={i}>
                        <h3>{s.title}</h3>
                        {s.blocks.map((b, j) => (
                          <Block
                            key={j}
                            block={b}
                            evidence={(ids) =>
                              setEvidence(
                                ids?.length
                                  ? item.evidence.filter((e) =>
                                      ids.includes(e.chunk_id),
                                    )
                                  : item.evidence,
                              )
                            }
                          />
                        ))}
                      </section>
                    ))}
                    <button onClick={() => setEvidence(item.evidence)}>
                      근거 원문 보기
                    </button>
                  </div>
                </details>
              ))}
            <button onClick={() => setShowDiff((v) => !v)}>
              직전 버전 비교
            </button>
            {showDiff && (
              <Feedback {...diff}>
                {diff.data && (
                  <div className="api-section">
                    <h3>
                      {diff.data.previous_version ?? '첫 버전'} →{' '}
                      {diff.data.version}
                    </h3>
                    <p>{display(diff.data.cause)}</p>
                    {!diff.data.previous_version ? (
                      <Empty>비교할 직전 버전이 없습니다.</Empty>
                    ) : (
                      <>
                        <Fields
                          values={[
                            ['변경', diff.data.counts?.changed],
                            ['표현만 변경', diff.data.counts?.wording_only],
                            ['동일', diff.data.counts?.same],
                          ]}
                        />
                        {diff.data.items.map((d) => (
                          <article key={d.item_code}>
                            <h4>
                              {d.item_code} {d.name} · {d.change}
                            </h4>
                            {d.finding && (
                              <p>
                                판정: {display(d.finding.before)} →{' '}
                                {display(d.finding.after)}
                              </p>
                            )}
                            {d.proposals.map((p, i) => (
                              <p key={i}>
                                이전: {display(p.before?.body)}
                                <br />
                                이후: {display(p.after?.body)}
                              </p>
                            ))}
                            {d.rows.removed.map((v, i) => (
                              <p key={`r${i}`}>− {v}</p>
                            ))}
                            {d.rows.added.map((v, i) => (
                              <p key={`a${i}`}>+ {v}</p>
                            ))}
                            {d.note && <p>{d.note}</p>}
                          </article>
                        ))}
                        <p>
                          표현만 변경:{' '}
                          {diff.data.wording_only_items.join(', ') || '없음'} ·
                          동일: {diff.data.same_items.join(', ') || '없음'}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </Feedback>
            )}
          </>
        ) : (
          <Empty>아직 생성된 제안서가 없습니다.</Empty>
        )}
      </Feedback>
      <details className="api-section" open>
        <summary>제안서 버전 이력</summary>
        <button
          onClick={() => {
            setSelected(null);
            setShowDiff(false);
          }}
        >
          최신 제안서
        </button>
        <Feedback {...versions}>
          {versions.data?.items.map((v) => (
            <button
              className="api-version"
              key={v.id}
              onClick={() => {
                setSelected(v.id);
                setShowDiff(false);
              }}
            >
              {v.version} · {date(v.created_at)} · 변경{' '}
              {display(v.changed_count)}
            </button>
          ))}
          {!versions.data?.items.length && <Empty />}
          <Pager
            next={versions.data?.next_cursor ?? null}
            back={cursor.length > 1}
            onNext={() => setCursor((c) => [...c, versions.data!.next_cursor!])}
            onBack={() => setCursor((c) => c.slice(0, -1))}
          />
        </Feedback>
      </details>
      {evidence && (
        <Dialog title="근거 원문" close={() => setEvidence(null)}>
          <EvidenceView items={evidence} />
        </Dialog>
      )}
    </>
  );
}
