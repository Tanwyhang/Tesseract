import type { Metadata } from "next";


import "~/app/globals.css";
import "@worldcoin/mini-apps-ui-kit-react/styles.css";
import { Providers } from "~/app/providers";
import { METADATA } from "~/lib/utils";

export const metadata: Metadata = {
  title: METADATA.name,
    openGraph: {
      title: METADATA.name,
      description: METADATA.description,
      images: [METADATA.bannerImageUrl],
      url: METADATA.homeUrl,
      siteName: METADATA.name
    },
};

import { GeistMono } from "geist/font/mono";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${GeistMono.variable} font-mono antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
