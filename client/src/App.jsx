import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

// Components
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ManagerRoute from './components/ManagerRoute';
import RoleRoute from './components/RoleRoute';

// Pages - Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ProfileEdit from './pages/profile/ProfileEdit';

// Pages - Requester
import ItemBrowser from './pages/requester/ItemBrowser';
import NewRequest from './pages/requester/NewRequest';
import MyRequests from './pages/requester/MyRequests';
import RequesterRequestDetail from './pages/requester/RequestDetail';

// Pages - Manager
import ManagerDashboard from './pages/manager/Dashboard';
import ManagerRequestDetail from './pages/manager/RequestDetail';
import ConditionReport from './pages/manager/ConditionReport';
import ItemManagement from './pages/manager/ItemManagement';
import ItemForm from './pages/manager/ItemForm';
import ItemConditionHistory from './pages/manager/ItemConditionHistory';
import CreateManagerAccount from './pages/manager/CreateManagerAccount';
import AdminPayments from './pages/admin/AdminPayments';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Profile Routes (Protected) */}
              <Route
                path="/profile/edit"
                element={
                  <ProtectedRoute>
                    <ProfileEdit />
                  </ProtectedRoute>
                }
              />

              {/* Requester Routes (Protected) */}
              <Route
                path="/"
                element={
                  <RoleRoute allow={['requester', 'manager']}>
                    <ItemBrowser />
                  </RoleRoute>
                }
              />
              <Route
                path="/requests"
                element={
                  <RoleRoute allow={['requester', 'manager']}>
                    <MyRequests />
                  </RoleRoute>
                }
              />
              <Route
                path="/requests/new"
                element={
                  <RoleRoute allow={['requester', 'manager']}>
                    <NewRequest />
                  </RoleRoute>
                }
              />
              <Route
                path="/requests/:id"
                element={
                  <RoleRoute allow={['requester', 'manager']}>
                    <RequesterRequestDetail />
                  </RoleRoute>
                }
              />

              {/* Admin Routes (Protected + Admin Role Required) */}
              <Route
                path="/admin"
                element={
                  <RoleRoute allow={['admin']}>
                    <AdminPayments />
                  </RoleRoute>
                }
              />

              {/* Manager Routes (Protected + Manager Role Required) */}
              <Route
                path="/manager"
                element={
                  <ManagerRoute>
                    <ManagerDashboard />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/create-account"
                element={
                  <ManagerRoute>
                    <CreateManagerAccount />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/requests/:id"
                element={
                  <ManagerRoute>
                    <ManagerRequestDetail />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/requests/:id/condition-report"
                element={
                  <ManagerRoute>
                    <ConditionReport />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/items"
                element={
                  <ManagerRoute>
                    <ItemManagement />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/items/new"
                element={
                  <ManagerRoute>
                    <ItemForm />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/items/:id/edit"
                element={
                  <ManagerRoute>
                    <ItemForm />
                  </ManagerRoute>
                }
              />
              <Route
                path="/manager/items/:id/history"
                element={
                  <ManagerRoute>
                    <ItemConditionHistory />
                  </ManagerRoute>
                }
              />

              {/* Catch-all Redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
