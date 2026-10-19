const { waitUntil } = require('@vercel/functions');

function runInBackground(promise) {
  if (typeof waitUntil === 'function') {
    waitUntil(promise);
    return;
  }

  Promise.resolve(promise).catch((err) => {
    console.error('Background job error:', err);
  });
}

module.exports = { runInBackground };
