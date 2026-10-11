import { useState } from "react";

export function useSynced<T>(source: T) {
  const [state, setState] = useState({ source, value: source });

  if (state.source !== source) {
    setState({ source, value: source });
  }

  const value = state.source === source ? state.value : source;

  function setValue(next: T) {
    setState({ source, value: next });
  }

  return [value, setValue] as const;
}
