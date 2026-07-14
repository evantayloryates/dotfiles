import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const DATA_DIR = process.env.JOB_HUNTER_DATA_DIR || path.join(ROOT, 'data');
export const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
export const LOCK_PATH = process.env.JOB_HUNTER_LOCK_PATH || path.join(ROOT, '.job-hunter.lock');
export const dataPath = (name) => path.join(DATA_DIR, name);
