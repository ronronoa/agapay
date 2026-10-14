import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AuthGate } from '../components/auth/AuthGate';
import { CampaignsPage } from '../pages/admin/CampaignsPage';
import { AuditLogPage } from '../pages/admin/AuditLogPage';
import { ItemTypesPage } from '../pages/admin/ItemTypesPage';
import { UsersPage } from '../pages/admin/UsersPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotImplementedPage } from '../pages/NotImplementedPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminMessagesPage } from '../pages/admin/AdminMessagesPage';
import { DonorActivityPage } from '../pages/donor/DonorActivityPage';
import { DonorCampaignPage } from '../pages/donor/DonorCampaignPage';
import { DonorDashboardPage } from '../pages/donor/DonorDashboardPage';
import { DonorDonationDetailPage } from '../pages/donor/DonorDonationDetailPage';
import { DonorMessagesPage } from '../pages/donor/DonorMessagesPage';
import { DonorSettingsPage } from '../pages/donor/DonorSettingsPage';
import { DashboardShell } from '../components/layout/DashboardShell';
import { PublicCampaignDetailPage } from '../pages/public/PublicCampaignDetailPage';
import { PublicCampaignsPage } from '../pages/public/PublicCampaignsPage';
import { RequestAssistancePage } from '../pages/public/RequestAssistancePage';
import { TrackAssistancePage } from '../pages/public/TrackAssistancePage';
import { VerifyRequestPage } from '../pages/public/VerifyRequestPage';

const ADMIN_ROLES = ['ADMIN', 'STAFF'] as const;

const DONOR_NAV_ITEMS = [
  { to: '/donor', label: 'Dashboard', end: true },
  { to: '/donor/activity', label: 'Activity' },
  { to: '/donor/campaign', label: 'Campaign' },
  { to: '/donor/messages', label: 'Messages' },
  { to: '/donor/settings', label: 'Settings' },
] as const;

// Groups are declared now so the shell and guards have a stable shape, but every
// page beyond Home is a placeholder until its milestone lands.
const router = createBrowserRouter([
  // Landing page uses its own header/footer (LandingHeader + LandingFooter),
  // so it lives outside the AppShell.
  { path: '/', element: <HomePage /> },

  // The beneficiary form follows its approved standalone design (landing
  // header plus split brand/form layout), so it lives outside the AppShell
  // like the landing page does.
  { path: 'request-assistance', element: <RequestAssistancePage /> },

  {
    path: '/',
    element: <AppShell />,
    children: [
      // Public
      { path: 'about', element: <NotImplementedPage title="About" /> },
      { path: 'how-it-works', element: <NotImplementedPage title="How It Works" /> },
      { path: 'campaigns', element: <PublicCampaignsPage /> },
      { path: 'campaigns/:slug', element: <PublicCampaignDetailPage /> },
      { path: 'track', element: <TrackAssistancePage /> },
      { path: 'verify-request', element: <VerifyRequestPage /> },
      {
        path: 'login',
        element: (
          <div className="py-8">
            <LoginPage />
          </div>
        ),
      },
      { path: 'register', element: <NotImplementedPage title="Donor Registration" /> },

      // Donor
      { path: 'donate', element: <NotImplementedPage title="Donate" /> },
      {
        path: 'donor',
        element: (
          <AuthGate roles={['DONOR']}>
            <DashboardShell items={DONOR_NAV_ITEMS} />
          </AuthGate>
        ),
        children: [
          { index: true, element: <DonorDashboardPage /> },
          { path: 'activity', element: <DonorActivityPage /> },
          { path: 'donations/:id', element: <DonorDonationDetailPage /> },
          { path: 'campaign', element: <DonorCampaignPage /> },
          { path: 'messages', element: <DonorMessagesPage /> },
          { path: 'settings', element: <DonorSettingsPage /> },
        ],
      },

      // Admin
      {
        path: 'admin',
        children: [
          {
            index: true,
            element: (
              <AuthGate roles={ADMIN_ROLES}>
                <DashboardShell
                  items={[
                    { to: '/admin', label: 'Dashboard', end: true },
                    { to: '/admin/campaigns', label: 'Campaigns' },
                    { to: '/admin/item-types', label: 'Item Types' },
                    { to: '/admin/users', label: 'Users' },
                    { to: '/admin/audit-logs', label: 'Audit Log' },
                    { to: '/admin/messages', label: 'Messages' },
                  ]}
                >
                  <AdminDashboardPage />
                </DashboardShell>
              </AuthGate>
            ),
          },
          {
            path: 'campaigns',
            element: (
              <AuthGate roles={ADMIN_ROLES}>
                <CampaignsPage />
              </AuthGate>
            ),
          },
          {
            path: 'item-types',
            element: (
              <AuthGate roles={ADMIN_ROLES}>
                <ItemTypesPage />
              </AuthGate>
            ),
          },
          {
            path: 'users',
            element: (
              <AuthGate roles={['ADMIN']}>
                <UsersPage />
              </AuthGate>
            ),
          },
          {
            path: 'audit-logs',
            element: (
              <AuthGate roles={ADMIN_ROLES}>
                <AuditLogPage />
              </AuthGate>
            ),
          },
          { path: 'donations', element: <NotImplementedPage title="Donations" /> },
          { path: 'requests', element: <NotImplementedPage title="Assistance Requests" /> },
          {
            path: 'messages',
            element: (
              <AuthGate roles={ADMIN_ROLES}>
                <AdminMessagesPage />
              </AuthGate>
            ),
          },
          { path: 'beneficiaries', element: <NotImplementedPage title="Beneficiaries" /> },
          { path: 'inventory', element: <NotImplementedPage title="Inventory" /> },
          { path: 'distributions', element: <NotImplementedPage title="Distributions" /> },
          { path: 'calendar', element: <NotImplementedPage title="Calendar" /> },
          { path: 'reports', element: <NotImplementedPage title="Reports" /> },
          { path: 'settings', element: <NotImplementedPage title="Settings" /> },
        ],
      },

      { path: 'forbidden', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
