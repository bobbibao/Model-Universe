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
