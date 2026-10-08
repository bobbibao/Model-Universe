export type PartnerStatus =
  'submitted' | 'changes_requested' | 'verified' | 'rejected' | 'restricted' | 'suspended' | 'closed';
export interface PartnerApplication {
  legalName: string;
  displayName: string;
  phone: string;
  pickupAddress: string;
  experience: string;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
}
export interface PartnerProfile {
  id: number;
  userId: number;
  status: PartnerStatus;
  version: number;
  application: PartnerApplication;
  identityVerifiedAt: string | null;
  bankVerifiedAt: string | null;
  maxListings: number | null;
  maxListingValueVnd: number | null;
  createdAt: string;
  events?: { id: number; action: string; actorUserId: number; details: Record<string, unknown>; createdAt: string }[];
  evidence?: { id: number; originalName: string }[];
}

export interface PartnerListing {
  id: number;
  partnerId: number;
  sku: string;
  name: string;
  brandName: string;
  price: number;
  stock: number;
  imageUrl: string;
  description: string;
  grade: string | null;
  scale: string | null;
  series: string | null;
  modelCode: string;
  condition: 'new' | 'preowned';
  assemblyState: string;
  boxCondition: string;
  includedAccessories: string[];
  defects: string[];
  categoryId: number;
  dispatchDays: number;
  listingStatus: 'draft' | 'review' | 'rejected' | 'approved' | 'published' | 'hidden';
  listingVersion: number;
  photos: { id: number; url: string; sha256: string; originalName: string }[];
  events: { id: number; action: string; version: number; createdAt: string; details: Record<string, unknown> }[];
}
export type PartnerListingSummary = Pick<
  PartnerListing,
  | 'id'
  | 'partnerId'
  | 'sku'
  | 'name'
  | 'price'
  | 'stock'
  | 'imageUrl'
  | 'condition'
  | 'dispatchDays'
  | 'listingStatus'
  | 'listingVersion'
>;
