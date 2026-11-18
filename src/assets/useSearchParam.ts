import { useState, useCallback, useEffect } from "react";

export function useSearchParamState(key: string, defaultValue: string = "") {
  // 1. Initialize state from the current URL search parameters
  const [value, setValue] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? defaultValue;
  });

  // 2. Function to update the parameter in the URL and trigger local state sync
  const setSearchParam = useCallback(
    (newValue: string) => {
      setValue(newValue);

      const params = new URLSearchParams(window.location.search);
      if (newValue) {
        params.set(key, newValue);
      } else {
        params.delete(key); // Remove parameter from URL if value is empty
      }

      // Update URL without reloading the page
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
      window.history.pushState({}, "", newUrl);

      // Optional: Dispatch a custom event so other components can sync if needed
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [key],
  );

  // 3. Listen to browser popstate (Back/Forward navigation) to keep React state in sync
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setValue(params.get(key) ?? defaultValue);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener?.("popstate", handlePopState); // cleanup
  }, [key, defaultValue]);

  return [value, setSearchParam] as const;
}
