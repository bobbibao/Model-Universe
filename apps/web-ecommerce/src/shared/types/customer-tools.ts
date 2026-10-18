import type { ShippingInfo } from './order';
import type { DeliveryAddress } from '../fulfillment';
export interface CustomerAddress { id: number; label: string; version: number; shipping: ShippingInfo; delivery?: DeliveryAddress | null; }
export interface CustomerNotification { id: number; kind: string; entityId: number; details: Record<string, unknown>; createdAt: string; readAt: string | null; }
export interface RestockPreference { id: number; productId: number; active: boolean; notifiedAt: string | null; product: { id: number; name: string; stock: number } | null; }
