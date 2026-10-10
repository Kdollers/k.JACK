export async function apiRequest(url, options = {}) {
  const companyId = localStorage.getItem('genesis_company_id') || 'comp-genesis-01';
  const userId = localStorage.getItem('genesis_user_id') || 'usr-admin';

  const headers = {
    'Content-Type': 'application/json',
    'x-company-id': companyId,
    'x-user-id': userId,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.error || (typeof data === 'string' ? data : 'API Request Failed');
    throw new Error(errorMsg);
  }

  return data;
}
