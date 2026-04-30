import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * TabTogether Secret Injection Script
 * Reads values from .env and replaces PLACEHOLDER_* strings in the dist/ directory.
 */

const ENV_FILE = '.env';
const TARGET_FILE = 'dist/background/firebase-transport.js';

function inject() {
  if (!fs.existsSync(ENV_FILE)) {
    console.warn(`.env file not found at ${ENV_FILE}. Skipping secret injection. Build will use placeholders.`);
    return;
  }

  const envContent = fs.readFileSync(ENV_FILE, 'utf8');
  const env = {};
  
  // Simple .env parser
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });

  if (!fs.existsSync(TARGET_FILE)) {
    console.error(`Target file not found: ${TARGET_FILE}. Ensure 'npm run prepare-dist' has run.`);
    process.exit(1);
  }

  let content = fs.readFileSync(TARGET_FILE, 'utf8');
  let replacements = 0;

  const mapping = {
    'PLACEHOLDER_API_KEY': 'FIREBASE_API_KEY',
    'PLACEHOLDER_SENDER_ID': 'FIREBASE_SENDER_ID',
    'PLACEHOLDER_MEASUREMENT_ID': 'FIREBASE_MEASUREMENT_ID'
  };

  for (const [placeholder, envKey] of Object.entries(mapping)) {
    if (env[envKey]) {
      // Use a global regex to replace all occurrences
      const regex = new RegExp(placeholder, 'g');
      const newContent = content.replace(regex, env[envKey]);
      if (newContent !== content) {
        content = newContent;
        replacements++;
      }
    } else {
      console.warn(`Warning: ${envKey} not found in .env. Placeholder ${placeholder} remains.`);
    }
  }

  if (replacements > 0) {
    fs.writeFileSync(TARGET_FILE, content, 'utf8');
    console.log(`Successfully injected ${replacements} secrets into ${TARGET_FILE}`);
  } else {
    console.log('No placeholders were replaced.');
  }
}

inject();
