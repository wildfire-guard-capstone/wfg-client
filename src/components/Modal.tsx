import { useMockActions } from '../runtime/MockRuntimeProvider';
import { memo } from 'react';

export const Modal = memo(function Modal() {
  const act = useMockActions();
  return (
    <div
      id="modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) act('closeModal');
      }}
    >
      <div id="modal">
        <h3 id="modal-title"></h3>
        <div id="modal-body"></div>
        <div id="modal-actions"></div>
      </div>
    </div>
  );
});
