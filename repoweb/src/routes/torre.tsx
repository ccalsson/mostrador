import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/torre")({
  component: TorreLayout,
});

function TorreLayout() {
  return <Outlet />;
}
