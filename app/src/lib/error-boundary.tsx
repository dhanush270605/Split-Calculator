import React, { useEffect } from 'react';
import { View } from 'react-native';
import { reportClientError } from '@/lib/api';
import { Btn, Card, Txt } from '@/ui/components';

/** Friendly crash screen (no stack traces for users); the error is reported to the admin error centre. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => { reportClientError(error.message, error.stack, 'boundary'); }, [error]);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Card tone="danger">
        <Txt variant="h2">Oops, something broke</Txt>
        <Txt variant="sub">The problem was reported automatically. You can try again.</Txt>
        <Btn title="Try again" onPress={retry} />
      </Card>
    </View>
  );
}
