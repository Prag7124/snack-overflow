export type UserRole = 'admin' | 'member';
export type SnackCategory = 'sweet' | 'savoury' | 'drink' | 'healthy-ish';
export type SnackStatus = 'stocked' | 'running_low' | 'gone';
export type ActivityAction = 'consumed' | 'restocked' | 'voted';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Snack {
  id: string;
  name: string;
  category: SnackCategory;
  quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  status: SnackStatus;
  vote_count: number;
  user_has_voted: boolean;
  created_at: string;
}

export interface ActivityItem {
  id: string;
  user_name: string;
  user_email: string;
  snack_name: string;
  action: ActivityAction;
  amount: number;
  created_at: string;
}

export interface ActivitySummary {
  total_consumed_7d: number;
  total_restocked_7d: number;
  top_consumed_snack: string | null;
  items: ActivityItem[];
}

export interface RestockRecommendation {
  snack_id: string;
  snack_name: string;
  category: SnackCategory;
  current_quantity: number;
  status: SnackStatus;
  vote_count: number;
  consumed_7d: number;
  suggested_restock_qty: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface CopilotResponse {
  answer: string;
  role_mode: 'admin' | 'member';
  source: 'gemini' | 'smart-fallback';
  recommendations: RestockRecommendation[];
}
