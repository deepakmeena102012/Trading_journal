import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../lib/api';

/**
 * GET a resource with loading/error state. Re-fetches when `path` or `params` change.
 * Pass `path = null` to skip fetching.
 */
export function useApi(path, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);
  const paramsKey = JSON.stringify(params || {});
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(path, { params: JSON.parse(paramsKey) });
      if (id === requestId.current) setData(res.data);
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, paramsKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
