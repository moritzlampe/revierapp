"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Revier } from "@/lib/types/revier";

type RevierContextType = {
  revier: Revier | null;
  setRevier: (revier: Revier) => void;
};

const RevierContext = createContext<RevierContextType>({
  revier: null,
  setRevier: () => {},
});

export function useRevier() {
  return useContext(RevierContext);
}

export function RevierProvider({
  initialRevier,
  children,
}: {
  initialRevier: Revier | null;
  children: ReactNode;
}) {
  const [revier, setRevier] = useState<Revier | null>(initialRevier);

  return (
    <RevierContext.Provider value={{ revier, setRevier }}>
      {children}
    </RevierContext.Provider>
  );
}
