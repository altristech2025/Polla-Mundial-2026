"use client";

import { useEffect, useState } from "react";

let externalShow: ((msg: string) => void) | null = null;

export function showToast(msg: string) {
  externalShow?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    externalShow = (m) => {
      setMsg(m);
      setTimeout(() => setMsg(null), 4000);
    };
    return () => {
      externalShow = null;
    };
  }, []);

  if (!msg) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-surface-elevated px-5 py-3 shadow-lg">
      <p className="text-sm">{msg}</p>
    </div>
  );
}
