"use client";

import { useCallback, useEffect, useState } from "react";

// Hook
function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);

      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.error(error);
    }
  }, [key]);

  // Return a wrapped version of useState's setter function
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        setStoredValue((currentValue) => {
          // Allow value to be a function so we have same API as useState
          const valueToStore = value instanceof Function ? value(currentValue) : value;
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
          return valueToStore;
        });
      } catch (error) {
        console.error(error);
      }
    },
    [key],
  );

  return [storedValue, setValue] as const;
}

export default useLocalStorage;
