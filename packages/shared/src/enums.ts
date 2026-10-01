// `const` objects, not TS `enum` (TS-09). Changing a Prisma enum means changing
// this in the same commit, or the types stop matching the database.
const defineEnum = <T extends readonly string[]>(values: T) =>
  Object.fromEntries(values.map((v) => [v, v])) as Record<T[number], T[number]>;

export const UserRole = defineEnum(['DONOR', 'STAFF', 'ADMIN'] as const);
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AuthTokenType = defineEnum(['VERIFY_EMAIL', 'RESET_PASSWORD'] as const);
export type AuthTokenType = (typeof AuthTokenType)[keyof typeof AuthTokenType];

export const CampaignStatus = defineEnum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const);
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const CalamityType = defineEnum([
  'TYPHOON',
  'FLOOD',
  'EARTHQUAKE',
  'FIRE',
  'VOLCANIC_ERUPTION',
  'LANDSLIDE',
  'OTHER',
] as const);
export type CalamityType = (typeof CalamityType)[keyof typeof CalamityType];

export const ItemCategory = defineEnum([
  'FOOD',
  'WATER',
  'CLOTHING',
  'HYGIENE',
  'BEDDING',
  'SCHOOL',
  'OTHER',
] as const);
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const DonationStatus = defineEnum([
  'PENDING',
  'REJECTED',
  'VERIFIED',
  'SCHEDULED',
  'COLLECTED',
  'COMPLETED',
  'CANCELLED',
] as const);
export type DonationStatus = (typeof DonationStatus)[keyof typeof DonationStatus];

export const RequestStatus = defineEnum([
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'DISTRIBUTED',
  'CANCELLED',
] as const);
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const DistributionStatus = defineEnum([
  'SCHEDULED',
  'DISTRIBUTED',
  'NO_SHOW',
  'CANCELLED',
] as const);
export type DistributionStatus = (typeof DistributionStatus)[keyof typeof DistributionStatus];

export const CalendarEventType = defineEnum([
  'DONATION_DRIVE',
  'COLLECTION',
  'DISTRIBUTION',
] as const);
export type CalendarEventType = (typeof CalendarEventType)[keyof typeof CalendarEventType];

export const CalendarEventStatus = defineEnum(['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const);
export type CalendarEventStatus = (typeof CalendarEventStatus)[keyof typeof CalendarEventStatus];

export const SyncStatus = defineEnum(['NOT_SYNCED', 'SYNCED', 'FAILED'] as const);
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const MovementType = defineEnum([
  'DONATION_IN',
  'RESERVE',
  'RELEASE',
  'DISTRIBUTE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
] as const);
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

export const EmailStatus = defineEnum([
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'SUPPRESSED',
] as const);
export type EmailStatus = (typeof EmailStatus)[keyof typeof EmailStatus];

export const NotificationType = defineEnum([
  'DONOR_VERIFY_EMAIL',
  'DONOR_PASSWORD_RESET',
  'DONATION_SUBMITTED',
  'DONATION_VERIFIED',
  'DONATION_REJECTED',
  'COLLECTION_SCHEDULED',
  'COLLECTION_REMINDER',
  'REQUEST_RECEIVED',
  'REQUEST_VERIFY_EMAIL',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_STATUS_UPDATED',
  'DISTRIBUTION_SCHEDULED',
  'DISTRIBUTION_REMINDER',
  'DISTRIBUTION_COMPLETED',
  'DISTRIBUTION_CANCELLED',
] as const);
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
