import { memo } from 'react';
export const Notifications = memo(function Notifications() {
  return (
    <>
      <div id="toast" role="status" />
      <div id="sys-alert" role="alert" />
    </>
  );
});
