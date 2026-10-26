import type { RouteObject } from 'react-router';

import { ApartmentPage } from '@/pages/ApartmentPage';
import { CatalogPage } from '@/pages/CatalogPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RootLayout } from '@/RootLayout';

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'apartments/:id', element: <ApartmentPage /> },
      {
        // Admin code (forms, validation) is loaded only when an administrator opens it.
        path: 'admin',
        lazy: async () => ({
          Component: (await import('@/pages/admin/AdminLayout')).AdminLayout,
        }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import('@/pages/admin/AdminDashboardPage')).AdminDashboardPage,
            }),
          },
          {
            path: 'apartments/new',
            lazy: async () => ({
              Component: (await import('@/pages/admin/ApartmentFormPage')).ApartmentFormRoute,
            }),
          },
          {
            path: 'apartments/:id',
            lazy: async () => ({
              Component: (await import('@/pages/admin/ApartmentFormPage')).ApartmentFormRoute,
            }),
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
