export type UserRole = 'admin' | 'member';
export type SnackCategory = 'sweet' | 'savoury' | 'drink' | 'healthy-ish';
export type SnackStatus = 'stocked' | 'running_low' | 'gone';
export type ActivityAction = 'consumed' | 'restocked' | 'voted';
export type OrderStatus = 'pending_pickup' | 'handed_over';

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

export interface OrderItem {
  snack_id: string | null;
  snack_name: string;
  quantity: number;
}

export interface PantryOrder {
  id: string;
  order_code: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: OrderStatus;
  total_items: number;
  items: OrderItem[];
  created_at: string;
}

export interface ActivityItem {
  id: string;
  user_name: string;
  user_email: string;
  snack_name: string;
  action: ActivityAction;
  amount: number;
  order_code: string | null;
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
  action_type?: 'none' | 'order_confirm' | 'order_created' | 'vote_added' | 'restocked' | 'orders_list';
  pending_order_items?: Array<{ snack_id: string; snack_name: string; quantity: number }>;
  created_order?: PantryOrder | null;
  user_orders?: PantryOrder[];
}
