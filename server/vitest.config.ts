import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    env: { BCRYPT_COST: '4', MAX_UPLOAD_BYTES: '4194304', UPLOAD_DIR: path.join(os.tmpdir(), 'splitcalc-test-uploads'), JWT_SECRET: 'test-secret-test-secret-test-secret' },
  },
});
