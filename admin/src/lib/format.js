// Money is stored as integer minor units + a currency code.
export function formatMoney(minor, currency = 'USD') {
  const amount = (Number(minor) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function toMinor(major) {
  return Math.round((Number(major) || 0) * 100);
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}
