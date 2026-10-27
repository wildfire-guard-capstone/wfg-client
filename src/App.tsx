import { LoginScreen } from './components/LoginScreen';
import { AppHeader } from './components/AppHeader';
import { MapToolbar } from './components/MapToolbar';
import { Sidebar } from './components/Sidebar';
import { MapStage } from './components/MapStage';
import { AdminScreen } from './components/AdminScreen';
import { Modal } from './components/Modal';
import { Notifications } from './components/Notifications';
import { MockRuntimeProvider } from './runtime/MockRuntimeProvider';

export default function App() {
  return (
    <MockRuntimeProvider>
      <LoginScreen />
      <AppHeader />
      <MapToolbar />
      <div id="main">
        <Sidebar />
        <MapStage />
      </div>
      <AdminScreen />
      <Modal />
      <Notifications />
    </MockRuntimeProvider>
  );
}
