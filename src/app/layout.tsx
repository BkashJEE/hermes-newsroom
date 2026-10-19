import type { Metadata, Viewport } from "next";
// Plex for the interface and for figures, as in X Studio; Barlow Condensed
// stays for headlines, which is what makes this read as a newspaper.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { APP } from "@/config/app";

export const metadata: Metadata = {
  title: { default: APP.name, template: `%s · ${APP.shortName}` },
  description: APP.description,
};

export const viewport: Viewport = { themeColor: "#0a0b0c", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
