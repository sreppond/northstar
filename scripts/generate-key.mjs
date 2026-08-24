#!/usr/bin/env node
/** Print a fresh 32-byte encryption key, base64. */
import { randomBytes } from 'node:crypto';
console.log(randomBytes(32).toString('base64'));
