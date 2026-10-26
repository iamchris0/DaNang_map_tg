import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';

import { consumeStartListingId } from '@/telegram/webapp';

/** Opens the listing from a Mini App deep link (startapp=<id>) once per launch. */
export function RootLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const listingId = consumeStartListingId();
    // Pushed on top of the catalog so "back" lands on the map.
    if (listingId) void navigate(`/apartments/${listingId}`);
  }, [navigate]);

  return <Outlet />;
}
