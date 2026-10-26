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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
