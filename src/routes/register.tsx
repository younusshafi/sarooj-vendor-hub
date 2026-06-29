import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for the /register segment. Children (register.index = generic onboarding,
// register.$token = pre-filled tokenized capture) render their own chrome, so this is a
// pure pass-through. Without this Outlet, /register/$token would render this route instead
// of the token child.
export const Route = createFileRoute("/register")({
  component: () => <Outlet />,
});
