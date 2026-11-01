import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { AppProviders } from "@/components/providers";
import { TEMA_BOOT } from "@/components/tema-boton";
import { AppErrorComponent } from "@/lib/error-component";
import appCss from "../styles.css?url";

const APP_NAME = "Mostrador";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Mostrador, tu gestión inteligente.",
      },
      { name: "theme-color", content: "#1B5E3B" },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: "Pedidos, caja y stock del puesto." },
      { property: "og:image", content: "/og.jpg" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  errorComponent: AppErrorComponent,
  component: Root,
});

function Root() {
  return (
    <html lang="es-AR" className="antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_BOOT }} />
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-paper text-ink">
        <AuthProvider>
          <AppProviders>
            <Outlet />
          </AppProviders>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
