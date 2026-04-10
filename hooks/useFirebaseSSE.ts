import { useEffect, useRef } from 'react';
import EventSource, { CustomEvent } from 'react-native-sse';

const DB_URL = 'https://echo-of-time-8a0aa-default-rtdb.firebaseio.com';

export type SSEPayload = { path: string; data: unknown };

type FirebaseSSEEvent = 'put' | 'patch' | 'cancel';

/**
 * Opens a Firebase SSE subscription to `path` authenticated with `token`.
 * Calls onPut/onPatch when the server pushes data, onAuthRevoked when the
 * token is rejected (caller should refresh the token and reopen).
 *
 * The connection is closed and reopened whenever path or token changes.
 * Callbacks are read via refs so they never need to be in the dep array.
 */
export function useFirebaseSSE(
  path: string | null,
  token: string | null,
  onPut: (payload: SSEPayload) => void,
  onPatch: (payload: SSEPayload) => void,
  onAuthRevoked: () => void,
) {
  const onPutRef = useRef(onPut);
  const onPatchRef = useRef(onPatch);
  const onAuthRevokedRef = useRef(onAuthRevoked);
  onPutRef.current = onPut;
  onPatchRef.current = onPatch;
  onAuthRevokedRef.current = onAuthRevoked;

  useEffect(() => {
    if (!path || !token) return;

    const es = new EventSource<FirebaseSSEEvent>(
      `${DB_URL}${path}.json?auth=${token}`,
    );

    const parsePayload = (e: CustomEvent<FirebaseSSEEvent>): SSEPayload | null => {
      if (!e.data) return null;
      const { path: p, data } = JSON.parse(e.data);
      return { path: p, data };
    };

    es.addEventListener('put', (e) => {
      const payload = parsePayload(e);
      if (payload) onPutRef.current(payload);
    });

    es.addEventListener('patch', (e) => {
      const payload = parsePayload(e);
      if (payload) onPatchRef.current(payload);
    });

    es.addEventListener('cancel', () => {
      onAuthRevokedRef.current();
    });

    es.addEventListener('error', (e) => {
      console.warn('[SSE] connection error', path, e);
    });

    return () => es.close();
  }, [path, token]);
}
