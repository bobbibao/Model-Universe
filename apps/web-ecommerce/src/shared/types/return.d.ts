export type ReturnStatus = 'REQUESTED' | 'RECEIVED' | 'REJECTED';

export type { ReturnReason } from '../return-rules';
import type { ReturnReason } from '../return-rules';

export type ReturnCondition = 'new' | 'open_box' | 'damaged';

export type ReturnItem = {
  id: number;
  orderItemId: number;
  quantity: number;
  reason: ReturnReason;
  condition: ReturnCondition | null;
  refundAmount: number | null;
  restockedAt: string | null;
  orderItem: {
    id: number;
    productId: number;
    productName: string;
    imageUrl: string;
    size: string;
    quantity: number;
    unitPrice: number;
  };
};

export type ReturnRequest = {
  id: number;
  orderId: number;
  status: ReturnStatus;
  resolutionStatus?: 'pending' | 'offered' | 'accepted' | 'rejected' | 'resolved' | null;
  customerNote: string | null;
  adminNote: string | null;
  receivedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  items: ReturnItem[];
  evidence?: { id: number; originalName: string }[];
  user?: { id: number; firstName: string; lastName: string; email: string; phone?: string | null };
  order?: { id: number; deliveredAt: string | null; total: number; createdAt: string };
};

// Returns of one of the customer's orders, and what can still be returned.
export type OrderReturnInfo = {
  canRequest: boolean;
  blockedReason: string | null;
  deadline: string | null;
  lines: { orderItemId: number; returnable: number }[];
  returns: ReturnRequest[];
};

export type ReturnRequestInput = {
  orderId: number;
  items: { orderItemId: number; quantity: number; reason: ReturnReason }[];
  note: string;
  evidenceIds?: number[];
};

export type ReturnIntakeInput = {
  decision: 'RECEIVED' | 'REJECTED';
  adminNote: string;
  items: { id: number; condition: ReturnCondition; refundAmount: number }[];
};
