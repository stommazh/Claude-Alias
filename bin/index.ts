#!/usr/bin/env node
import { run } from '../src/index.js';

run().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
