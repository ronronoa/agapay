import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotImplementedPage } from '../pages/NotImplementedPage';

// Groups are declared now so the shell and guards have a stable shape, but every
// page beyond Home is a placeholder until its milestone lands.
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },

      // ── Public ──
      { path: 'about', element: <NotImplementedPage title="About" /> },
      { path: 'how-it-works', element: <NotImplementedPage title="How It Works" /> },
      { path: 'campaigns', element: <NotImplementedPage title="Campaigns" /> },
      { path: 'campaigns/:slug', element: <NotImplementedPage title="Campaign" /> },
      { path: 'request-assistance', element: <NotImplementedPage title="Request Assistance" /> },
      { path: 'track', element: <NotImplementedPage title="Track Assistance" /> },
      { path: 'login', element: <NotImplementedPage title="Log In" /> },
      { path: 'register', element: <NotImplementedPage title="Donor Registration" /> },

      // ── Donor ──
      { path: 'donate', element: <NotImplementedPage title="Donate" /> },
      {
        path: 'donor',
        children: [
          { index: true, element: <NotImplementedPage title="Donor Dashboard" /> },
          { path: 'donations', element: <NotImplementedPage title="My Donations" /> },
          { path: 'profile', element: <NotImplementedPage title="Profile" /> },
        ],
      },

      // ── Admin ──
      {
        path: 'admin',
        children: [
          { index: true, element: <NotImplementedPage title="Admin Dashboard" /> },
          { path: 'donations', element: <NotImplementedPage title="Donations" /> },
          { path: 'requests', element: <NotImplementedPage title="Assistance Requests" /> },
          { path: 'beneficiaries', element: <NotImplementedPage title="Beneficiaries" /> },
          { path: 'inventory', element: <NotImplementedPage title="Inventory" /> },
          { path: 'campaigns', element: <NotImplementedPage title="Campaigns" /> },
          { path: 'distributions', element: <NotImplementedPage title="Distributions" /> },
          { path: 'calendar', element: <NotImplementedPage title="Calendar" /> },
          { path: 'reports', element: <NotImplementedPage title="Reports" /> },
          { path: 'users', element: <NotImplementedPage title="Users" /> },
          { path: 'settings', element: <NotImplementedPage title="Settings" /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
