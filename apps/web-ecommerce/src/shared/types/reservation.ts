import type { ReservationStatus } from '../reservation';

export interface Reservation {
  id: number;
  productId: number;
  productName: string;
  imageUrl: string;
  quantity: number;
  totalVnd: number;
  paidVnd: number;
  remainingVnd: number;
  minimumInitialVnd: number;
  status: ReservationStatus;
  expiresAt?: string;
  orderId?: number;
  policyVersion: number;
  evidence?: { id: number; originalName: string }[];
  payments?: { id: number; kind: string; amountVnd: number; externalReference: string; createdAt: string }[];
  events?: { id: number; action: string; reason: string; createdAt: string }[];
}
