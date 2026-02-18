"use client";

import dynamic from "next/dynamic";

const TapTrade = dynamic(() => import("~/components/tap-trade"), {
  ssr: false,
});

export default function App() {
  return <TapTrade />;
}
