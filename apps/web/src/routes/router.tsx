import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Activity, LayoutDashboard, Megaphone, MessageSquare, Settings } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { PublicCampaignLayout } from '../components/layout/PublicCampaignLayout';
import { AdminShell } from '../components/layout/AdminShell';
import { AuthGate } from '../components/auth/AuthGate';
import { CampaignsPage } from '../pages/admin/CampaignsPage';
import { AuditLogPage } from '../pages/admin/AuditLogPage';
import { ItemTypesPage } from '../pages/admin/ItemTypesPage';
import { UsersPage } from '../pages/admin/UsersPage';
import { SettingsPage } from '../pages/admin/SettingsPage';
import { ReportsPage } from '../pages/admin/ReportsPage';
import { EmailOperationsPage } from '../pages/admin/EmailOperationsPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { HomePage } from '../pages/HomePage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../pages/auth/VerifyEmailPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotImplementedPage } from '../pages/NotImplementedPage';
import { CalendarPage } from '../features/scheduling/CalendarPage';
import { DistributionsPage } from '../features/scheduling/DistributionsPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { DonationsPage } from '../pages/admin/DonationsPage';
import { RequestsPage } from '../pages/admin/RequestsPage';
import { InventoryPage } from '../pages/admin/InventoryPage';
import { AdminMessagesPage } from '../pages/admin/AdminMessagesPage';
import { DonorActivityPage } from '../pages/donor/DonorActivityPage';
import { DonorCampaignPage } from '../pages/donor/DonorCampaignPage';
import { DonorDashboardPage } from '../pages/donor/DonorDashboardPage';
import { DonorDonationDetailPage } from '../pages/donor/DonorDonationDetailPage';
import { DonorMessagesPage } from '../pages/donor/DonorMessagesPage';
import { DonorSettingsPage } from '../pages/donor/DonorSettingsPage';
import { DonatePage } from '../pages/donor/DonatePage';
import { DashboardShell } from '../components/layout/DashboardShell';
import { PublicCampaignDetailPage } from '../pages/public/PublicCampaignDetailPage';
import { PublicCampaignsPage } from '../pages/public/PublicCampaignsPage';
import { RequestAssistancePage } from '../pages/public/RequestAssistancePage';
import { PrivacyPage } from '../pages/public/PrivacyPage';
import { TrackAssistancePage } from '../pages/public/TrackAssistancePage';
import { VerifyRequestPage } from '../pages/public/VerifyRequestPage';

const ADMIN_ROLES = ['ADMIN', 'STAFF'] as const;

const DONOR_NAV_ITEMS = [
  { to: '/donor', label: 'Dashboard', icon: LayoutDashboard, end: true, section: 'My donations' },
  { to: '/donor/campaign', label: 'Campaigns', icon: Megaphone, section: 'My donations' },
  { to: '/donor/activity', label: 'Donation activity', icon: Activity, section: 'My donations' },
  { to: '/donor/messages', label: 'Messages', icon: MessageSquare, section: 'Account' },
  { to: '/donor/settings', label: 'Settings', icon: Settings, section: 'Account' },
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
  { path: 'privacy', element: <PrivacyPage /> },

  // Tracking pages share the landing header/footer with the rest of the
  // public journey, so /track never shows a different site header.
  { path: 'track', element: <TrackAssistancePage /> },
  { path: 'verify-request', element: <VerifyRequestPage /> },

  // Auth screens follow the same standalone split layout as the beneficiary
  // form, so they live outside the AppShell too.
  { path: 'login', element: <LoginPage /> },
  { path: 'register', element: <RegisterPage /> },
  { path: 'verify-email', element: <VerifyEmailPage /> },
  { path: 'forgot-password', element: <ForgotPasswordPage /> },
  { path: 'reset-password', element: <ResetPasswordPage /> },

  // The donor application runs on its own shell (sidebar plus dashboard
  // header), so it must sit outside the public AppShell: nesting it made the
  // sidebar render inside the public max-w-6xl container with a second
  // header, footer, and sign-out on top of it.
  {
    path: 'donate',
    element: (
      <AuthGate roles={['DONOR']}>
        <DashboardShell items={DONOR_NAV_ITEMS}>
          <DonatePage />
        </DashboardShell>
      </AuthGate>
    ),
  },
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

  // The admin application gets the same full-height shell as the donor one,
  // so it sits outside the public AppShell for the same reason.
  {
    path: 'admin',
    element: (
      <AuthGate roles={ADMIN_ROLES}>
        <AdminShell />
      </AuthGate>
    ),
    children: [
      { index: true, element: <AdminDashboardPage />, handle: { shellTitle: 'Dashboard' } },
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
      {
        path: 'donations',
        element: (
          <AuthGate roles={ADMIN_ROLES}>
            <DonationsPage />
          </AuthGate>
        ),
      },
      {
        path: 'requests',
        element: (
          <AuthGate roles={ADMIN_ROLES}>
            <RequestsPage />
          </AuthGate>
        ),
      },
      {
        path: 'messages',
        element: (
          <AuthGate roles={ADMIN_ROLES}>
            <AdminMessagesPage />
          </AuthGate>
        ),
      },
      { path: 'beneficiaries', element: <NotImplementedPage title="Beneficiaries" /> },
      {
        path: 'inventory',
        element: (
          <AuthGate roles={ADMIN_ROLES}>
            <InventoryPage />
          </AuthGate>
        ),
      },
      { path: 'distributions', element: <DistributionsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'emails', element: <EmailOperationsPage /> },
      {
        path: 'settings',
        element: (
          <AuthGate roles={['ADMIN']}>
            <SettingsPage />
          </AuthGate>
        ),
      },
    ],
  },

  {
    element: <PublicCampaignLayout />,
    children: [
      { path: '/campaigns', element: <PublicCampaignsPage /> },
      { path: '/campaigns/:slug', element: <PublicCampaignDetailPage /> },
    ],
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: 'about', element: <NotImplementedPage title="About" /> },
      { path: 'how-it-works', element: <NotImplementedPage title="How It Works" /> },

      { path: 'forbidden', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
