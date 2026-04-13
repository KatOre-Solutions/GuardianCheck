import { useState, useCallback } from "react";
import { showErrorToast } from "../lib/error-handler";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: any | null;
}

export function useAsync<T>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (
    asyncFunction: () => Promise<T>,
    options: { 
      showToast?: boolean; 
      successMessage?: string;
      onSuccess?: (data: T) => void;
      onError?: (error: any) => void;
    } = { showToast: true }
  ) => {
    setState({ data: null, loading: true, error: null });
    try {
      const response = await asyncFunction();
      setState({ data: response, loading: false, error: null });
      
      if (options.onSuccess) options.onSuccess(response);
      
      return response;
    } catch (error: any) {
      setState({ data: null, loading: false, error });
      
      if (options.showToast !== false) {
        showErrorToast(error);
      }
      
      if (options.onError) options.onError(error);
      
      throw error;
    }
  }, []);

  return { ...state, execute };
}
