import { useState } from 'react';
import type { AssistantResponse, CorrectionPreview, Evidence } from '../../api';
import { createIdempotencyKey, waitForOperation } from '../../api';
import type { IncidentContext } from './types';
import { date, display, useAction, useResource } from './hooks';
import { ActionFeedback, Dialog, Empty, Feedback, Pager } from './ui';
import { EvidenceView } from './ProposalPanel';

export function AssistantPanel({
  api,
  client,
  incident,
  refresh,
}: IncidentContext) {
  const path = { incident_id: incident.id };
  const [input, setInput] = useState(''),
    [reply, setReply] = useState<AssistantResponse | null>(null);
  const [confirmation, setConfirmation] = useState<{
    preview: CorrectionPreview;
    key: string;
  } | null>(null);
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [qaCursor, setQaCursor] = useState<(string | undefined)[]>([undefined]),
    [corCursor, setCorCursor] = useState<(string | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0),
    action = useAction();
  const history = useResource(
    (signal) =>
      api.assistant.history({
        path,
        query: { cursor: qaCursor.at(-1), limit: 10 },
        signal,
      }),
    [incident.id, revision, qaCursor.at(-1)],
  );
  const corrections = useResource(
    (signal) =>
      api.corrections.history({
        path,
        query: { cursor: corCursor.at(-1), limit: 10 },
        signal,
      }),
    [incident.id, revision, corCursor.at(-1)],
  );
  async function observe(
    operationId: string,
    signal: AbortSignal,
    progress: (text: string) => void,
  ) {
    const result = await waitForOperation(
      client,
      { ...path, operation_id: operationId },
      {
        signal,
        onUpdate: (op) => progress(`정정은 저장됨 · 제안 재생성 ${op.status}`),
      },
    );
    if (signal.aborted) return;
    refresh();
    if (result.status === 'FAILED')
      throw new Error(
        `정정은 저장되었습니다. 제안 생성 실패: ${result.error?.message ?? '정보 없음'}. 제안만 다시 생성할 수 있습니다.`,
      );
    progress('정정을 저장하고 제안서를 갱신했습니다.');
  }
  return (
    <>
      <h2>AI 질의·상황 정정</h2>
      <p className="api-note">
        질문은 답변으로, 상황 변경은 저장 전 확인안으로 표시됩니다. 변경 내용을
        확인한 뒤 저장하세요.
      </p>
      <form
        className="api-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async (signal, progress) => {
            const data = await api.assistant.send({
              path,
              body: {
                input_text: input,
                proposal_id: incident.latest_proposal_id,
              },
              signal,
            });
            if (signal.aborted) return;
            setReply(data);
            setConfirmation(
              data.type === 'CORRECTION_PREVIEW'
                ? { preview: data, key: createIdempotencyKey() }
                : null,
            );
            setInput('');
            setRevision((n) => n + 1);
            progress(
              data.type === 'CORRECTION_PREVIEW'
                ? '확인안입니다. 아직 저장하지 않았습니다.'
                : '응답을 받았습니다.',
            );
          });
        }}
      >
        <label>
          질문 또는 상황 변경
          <textarea
            aria-label="질문 또는 상황 변경"
            required
            maxLength={2000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <button className="primary" disabled={action.pending || !!confirmation}>
          전송
        </button>
      </form>
      <ActionFeedback {...action} cancel={action.cancel} />
      {reply?.type === 'UNSUPPORTED' && (
        <div className="api-note">
          <p>{reply.reason}</p>
          {reply.ignored.map((i, n) => (
            <p key={n}>
              {i.text}: {i.reason}
            </p>
          ))}
        </div>
      )}
      {reply?.type === 'ANSWER' && (
        <article className="api-section">
          <h3>답변</h3>
          <p className="api-prewrap">{reply.message.answer}</p>
          {reply.message.insufficient.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          <button onClick={() => setEvidence(reply.message.citations)}>
            답변 근거 보기
          </button>
        </article>
      )}
      {confirmation && (
        <section aria-label="정정 확인안" className="api-confirm">
          <h3>정정 확인안 · 아직 저장하지 않음</h3>
          <p>{confirmation.preview.summary}</p>
          {confirmation.preview.changes.map((c, i) => (
            <p key={i}>
              <b>{c.label}</b>
              <br />
              {display(c.before)} → {display(c.after)}
            </p>
          ))}
          {confirmation.preview.notes.map((v, i) => (
            <p key={i}>{v}</p>
          ))}
          {confirmation.preview.ignored.map((v, i) => (
            <p key={i}>
              {v.text}: {v.reason}
            </p>
          ))}
          <p>유효시각 {date(confirmation.preview.expires_at)}</p>
          <button
            disabled={action.pending || incident.status === 'ENDED'}
            className="primary"
            onClick={() =>
              void action.run(async (signal, progress) => {
                const saved = await api.corrections.confirm({
                  path,
                  body: {
                    confirmation_token: confirmation.preview.confirmation_token,
                  },
                  idempotencyKey: confirmation.key,
                  signal,
                });
                if (signal.aborted) return;
                setConfirmation(null);
                setReply(null);
                setRevision((n) => n + 1);
                progress('정정은 저장되었습니다.');
                refresh();
                if (saved.proposal_operation)
                  await observe(saved.proposal_operation.id, signal, progress);
                else refresh();
              })
            }
          >
            확인 후 저장
          </button>
          <button
            disabled={action.pending}
            onClick={() => {
              setConfirmation(null);
              setReply(null);
            }}
          >
            확인안 취소
          </button>
        </section>
      )}
      {incident.proposal_stale && (
        <section className="api-section">
          <p className="api-warn">정정이 제안서에 아직 반영되지 않았습니다.</p>
          <button
            disabled={
              action.pending ||
              !!incident.running_operation_id ||
              incident.status === 'ENDED'
            }
            onClick={() =>
              void action.run(async (signal, progress) => {
                const job = await api.proposals.regenerate({
                  path,
                  body: {
                    expected_prediction_id: incident.latest_prediction_id!,
                    situation_revision: incident.situation_revision,
                  },
                  idempotencyKey: createIdempotencyKey(),
                  signal,
                });
                if (!signal.aborted) await observe(job.id, signal, progress);
              })
            }
          >
            제안만 다시 생성
          </button>
          <button onClick={refresh}>정정·제안 상태 갱신</button>
        </section>
      )}
      <details open className="api-section">
        <summary>질의응답 이력</summary>
        <Feedback {...history}>
          {history.data?.items.length ? (
            history.data.items.map((m) => (
              <article className="api-message" key={m.id}>
                <b>{m.question}</b>
                <p className="api-prewrap">{m.answer}</p>
                {m.no_evidence && <p>답할 자료나 근거가 부족합니다.</p>}
                <small>{date(m.created_at)}</small>
                <button onClick={() => setEvidence(m.citations)}>근거</button>
              </article>
            ))
          ) : (
            <Empty />
          )}
          <Pager
            next={history.data?.next_cursor ?? null}
            back={qaCursor.length > 1}
            onNext={() =>
              setQaCursor((c) => [...c, history.data!.next_cursor!])
            }
            onBack={() => setQaCursor((c) => c.slice(0, -1))}
          />
        </Feedback>
      </details>
      <details open className="api-section">
        <summary>확인된 상황 정정 이력</summary>
        <Feedback {...corrections}>
          {corrections.data?.items.length ? (
            corrections.data.items.map((c) => (
              <article key={c.id} className="api-message">
                <b>{c.input_text}</b>
                {c.changes.map((change, i) => (
                  <p key={i}>{change.label}</p>
                ))}
                <small>{date(c.created_at)}</small>
              </article>
            ))
          ) : (
            <Empty>저장된 정정이 없습니다.</Empty>
          )}
          <Pager
            next={corrections.data?.next_cursor ?? null}
            back={corCursor.length > 1}
            onNext={() =>
              setCorCursor((c) => [...c, corrections.data!.next_cursor!])
            }
            onBack={() => setCorCursor((c) => c.slice(0, -1))}
          />
        </Feedback>
      </details>
      {evidence && (
        <Dialog title="답변 근거" close={() => setEvidence(null)}>
          <EvidenceView items={evidence} />
        </Dialog>
      )}
    </>
  );
}
