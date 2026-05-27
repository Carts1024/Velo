"use client";

import { useEffect, useState } from "react";

export default function useClientSide() {
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    setIsBrowser(true);
  }, []);

  return { isBrowser };
}
