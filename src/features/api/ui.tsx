import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { display } from './hooks';

export function Feedback({
  loading,
  error,
  reload,
  children,
  data,
}: {
  data?: unknown;
  loading?: boolean;
  error?: string;
  reload?: () => void;
  children?: ReactNode;
}) {
  if (loading && data === undefined)
    return (
      <p role="status" className="api-note">
        불러오는 중…
      </p>
    );
  return (
    <>
      {loading && (
        <p role="status" className="api-note">
          갱신 중…
        </p>
      )}
      {error && (
        <div role="alert" className="api-error">
          {error} {reload && <button onClick={reload}>다시 시도</button>}
        </div>
      )}
      {(!error || data !== undefined) && children}
    </>
  );
}
export function ActionFeedback({
  pending,
  error,
  message,
  cancel,
}: {
  pending: boolean;
  error: string;
  message: string;
  cancel?: () => void;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="api-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="api-note">
          {message}{' '}
          {pending && cancel && <button onClick={cancel}>대기 중지</button>}
        </p>
      )}
    </>
  );
}
export function Fields({ values }: { values: [string, unknown][] }) {
  return (
    <dl className="api-fields">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{display(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Empty({
  children = '조회된 데이터가 없습니다.',
}: {
  children?: ReactNode;
}) {
  return <p className="api-empty">{children}</p>;
}
export function Pager({
  next,
  back,
  disabled,
  onNext,
  onBack,
}: {
  next: string | null;
  back: boolean;
  disabled?: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="api-row">
      <button disabled={disabled || !back} onClick={onBack}>
        이전 페이지
      </button>
      <button disabled={disabled || !next} onClick={onNext}>
        다음 페이지
      </button>
    </div>
  );
}
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="api-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
          const focusable = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          );
          const first = focusable?.[0],
            last = focusable?.[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="api-dialog"
      >
        <header>
          <h2>{title}</h2>
          <button onClick={close} aria-label={`${title} 닫기`}>
            닫기
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
