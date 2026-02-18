"use client";

import dynamic from "next/dynamic";

import FrameProvider from "~/components/providers/frame-provider";


const WagmiProvider = dynamic(
  () => import("~/components/providers/wagmi-provider"),
  {
    ssr: false,
  }
);

const ErudaProvider = dynamic(
  () => import("~/components/providers/eruda-provider"),
  {
    ssr: false,
  }
);

const ToasterProvider = dynamic(
  () => import("~/components/providers/toaster-provider"),
  {
    ssr: false,
  }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider>
      <FrameProvider>
        <ErudaProvider />
        <ToasterProvider />
        {children}
      </FrameProvider>
    </WagmiProvider>
  );
}
