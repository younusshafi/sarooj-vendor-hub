import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";

function RfqLayout() {
  const location = useLocation();
  return <Outlet key={location.pathname} />;
}

export const Route = createFileRoute("/_app/rfq")({
  component: RfqLayout,
});
