// Used in list views so a reviewer scanning the queue sees only what they need to pick a record.
const maskWord = (w) => (w.length <= 1 ? '*' : `${w[0]}${'*'.repeat(Math.min(w.length - 1, 4))}`);

const maskName = (name) => (name ? name.split(/\s+/).map(maskWord).join(' ') : '—');

function maskEmail(email) {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  return `${maskWord(local)}@${domain}`;
}

module.exports = { maskName, maskEmail };
