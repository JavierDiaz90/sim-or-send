#!/usr/bin/env node
'use strict';

const site = process.env.SITE_URL || process.argv[2];
const token = process.env.ADMIN_RESET_TOKEN || process.argv[3];

if (!site || !token) {
  console.error('Usage: node scripts/reset-today.js https://your-site.netlify.app ADMIN_RESET_TOKEN');
  console.error('Or set SITE_URL and ADMIN_RESET_TOKEN environment variables.');
  process.exit(1);
}

fetch(`${site.replace(/\/$/, '')}/api/reset`, {
  method: 'POST',
  headers: { 'x-admin-token': token },
}).then(async response => {
  const body = await response.text();
  if (!response.ok) throw new Error(body);
  console.log(body);
}).catch(error => {
  console.error(error.message);
  process.exit(1);
});
