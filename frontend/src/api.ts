import type {
  ActivityAction,
  ActivitySummary,
  CopilotResponse,
  Snack,
  SnackCategory,
  SnackStatus,
  TokenResponse,
  User,
} from './types';

export const API_BASE = 'http://127.0.0.1:8000';

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const code = body?.error?.code || 'HTTP_ERROR';
    const message = body?.error?.message || `Request failed with status ${res.status}`;
    throw new ApiClientError(res.status, code, message);
  }

  return body as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => request<User>('/auth/me', {}, token),

  uploadSnackImage: async (token: string, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/snacks/upload-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiClientError(
        res.status,
        body?.error?.code || 'UPLOAD_FAILED',
        body?.error?.message || 'Image upload failed'
      );
    }
    return body.image_url as string;
  },

  listSnacks: (
    token: string,
    filters?: { category?: SnackCategory | ''; status?: SnackStatus | ''; search?: string }
  ) => {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return request<Snack[]>(`/snacks${qs ? `?${qs}` : ''}`, {}, token);
  },

  createSnack: (
    token: string,
    data: {
      name: string;
      category: SnackCategory;
      quantity: number;
      low_stock_threshold: number;
      image_url?: string | null;
    }
  ) =>
    request<Snack>(
      '/snacks',
      { method: 'POST', body: JSON.stringify(data) },
      token
    ),

  updateSnack: (
    token: string,
    id: string,
    data: {
      name?: string;
      category?: SnackCategory;
      low_stock_threshold?: number;
      image_url?: string | null;
    }
  ) =>
    request<Snack>(
      `/snacks/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      token
    ),

  deleteSnack: (token: string, id: string) =>
    request<void>(`/snacks/${id}`, { method: 'DELETE' }, token),

  consumeSnack: (token: string, id: string, amount = 1) =>
    request<Snack>(
      `/snacks/${id}/consume`,
      { method: 'POST', body: JSON.stringify({ amount }) },
      token
    ),

  restockSnack: (token: string, id: string, amount: number) =>
    request<Snack>(
      `/snacks/${id}/restock`,
      { method: 'POST', body: JSON.stringify({ amount }) },
      token
    ),

  voteSnack: (token: string, id: string) =>
    request<Snack>(`/snacks/${id}/vote`, { method: 'POST' }, token),

  unvoteSnack: (token: string, id: string) =>
    request<Snack>(`/snacks/${id}/vote`, { method: 'DELETE' }, token),

  getActivity: (token: string, action?: ActivityAction | '', limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (action) params.set('action', action);
    return request<ActivitySummary>(`/activity?${params.toString()}`, {}, token);
  },

  getRestockPlan: (token: string) =>
    request<CopilotResponse>('/copilot/restock-plan', {}, token),

  askCopilot: (token: string, question: string) =>
    request<CopilotResponse>(
      '/copilot/ask',
      { method: 'POST', body: JSON.stringify({ question }) },
      token
    ),
};
