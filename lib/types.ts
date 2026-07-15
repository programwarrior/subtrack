export const frequencies = ["weekly", "monthly", "bimonthly", "quarterly", "biannual", "yearly", "custom", "one-time"] as const;
export type BillingFrequency = (typeof frequencies)[number];
export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export interface Payment {
  id: string;
  paymentDate: string;
  scheduledDate?: string;
  amount: number;
  status: "paid" | "missed" | "estimated";
  note?: string;
}

export interface PriceChange {
  id: string;
  previousPrice: number;
  newPrice: number;
  effectiveDate: string;
  note?: string;
}

export interface Subscription {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingFrequency: BillingFrequency;
  customIntervalNumber?: number;
  customIntervalUnit?: "days" | "weeks" | "months" | "years";
  nextPaymentDate: string;
  firstPaymentDate?: string;
  category: string;
  note: string;
  reminderDaysBefore: number | null;
  paymentMethodLabel: string;
  websiteUrl: string;
  status: SubscriptionStatus;
  autoRenewalStatus: "auto" | "manual" | "unknown";
  isFreeTrial: boolean;
  trialEndDate?: string;
  trialFirstPaymentAmount?: number;
  createdAt: string;
  updatedAt: string;
  payments: Payment[];
  priceHistory: PriceChange[];
}

export interface DeletedSubscription {
  subscription: Subscription;
  deletedAt: string;
}

export interface Settings {
  currency: string;
  dateFormat: DateFormat;
  firstDayOfWeek: "monday" | "sunday";
  defaultReminderDays: number | null;
  notifications: boolean;
  theme: "light" | "dark" | "system";
}

export interface AppData {
  subscriptions: Subscription[];
  settings: Settings;
  tombstones: Record<string, string>;
  deletedSubscriptions: DeletedSubscription[];
}

export const categories = ["Entertainment", "Software", "AI tools", "Website and hosting", "Work", "Education", "Fitness", "Finance", "Utilities", "Membership", "Other"];

export const defaultSettings: Settings = {
  currency: "EUR",
  dateFormat: "DD/MM/YYYY",
  firstDayOfWeek: "monday",
  defaultReminderDays: 3,
  notifications: false,
  theme: "system",
};
