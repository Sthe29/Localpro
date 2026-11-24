export type AuthView = 'landing' | 'register' | 'login';

export type AppView =
  | AuthView
  | 'home'
  | 'explore'
  | 'create-post'
  | 'enquiries'
  | 'profile'
  | 'public-profile'
  | 'post-detail'
  | 'notifications'
  | 'settings';

export interface SkillItem {
  id: number;
  name: string;
  category: string;
}

export interface CategoryItem {
  id: number;
  name: string;
}

export interface ProfileStats {
  totalPosts: number;
  totalLikes: number;
  engagementCount: number;
}

export interface PublicProfile {
  id: string;
  fullName: string;
  province: string;
  city: string;
  suburb: string;
  bio: string;
  avatarUrl: string | null;
  serviceLocation: string;
  hasSkills: boolean;
  skillDescription: string;
  createdAt: string;
  skills: SkillItem[];
  customSkills: string[];
  stats: ProfileStats;
}

export interface UserProfile extends PublicProfile {
  email: string;
  emailVerified?: boolean;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface PendingEmailChange {
  newEmail: string;
  expiresAt: string;
}

export interface SecurityLogItem {
  id: string;
  eventType: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReportPayload {
  targetType: 'post' | 'user';
  targetId: string;
  reason: string;
  details: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  province: string;
  city: string;
  suburb: string;
  hasSkills: boolean;
  skillIds: number[];
  customSkills: string[];
  skillDescription: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UpdateSkillsPayload {
  hasSkills: boolean;
  skillIds: number[];
  customSkills: string[];
  skillDescription: string;
}

export interface UpdateProfilePayload {
  fullName: string;
  bio: string;
  province: string;
  city: string;
  suburb: string;
  serviceLocation: string;
  hasSkills: boolean;
  skillIds: number[];
  customSkills: string[];
  skillDescription: string;
}

export type FeedScope = 'near' | 'city' | 'kzn' | 'everywhere';
export type FeedSort = 'recent' | 'liked';

export interface PostItem {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  categoryId: number;
  categoryName: string;
  description: string;
  province: string;
  city: string;
  suburb: string;
  priceText: string;
  createdAt: string;
  updatedAt: string;
  images: string[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isAuthor: boolean;
}

export interface CommentItem {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  commentText: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface PostPayload {
  description: string;
  categoryId: number;
  province: string;
  city: string;
  suburb: string;
  priceText: string;
  images: string[];
}

export interface ExploreFilters {
  q?: string;
  province?: string;
  city?: string;
  suburb?: string;
  category?: string;
  skill?: string;
}

export interface DiscoverData {
  providersInArea: PublicProfile[];
  recentlyActiveProviders: PublicProfile[];
  recentPosts: PostItem[];
  categories: Array<{ id: number; name: string; postCount: number }>;
}

export type EnquiryStatus = 'Pending' | 'Accepted' | 'Declined' | 'Completed' | 'Cancelled';

export interface EnquiryItem {
  id: string;
  customerId: string;
  customerName: string;
  customerAvatarUrl: string | null;
  providerId: string;
  providerName: string;
  providerAvatarUrl: string | null;
  providerLocation: string;
  serviceRequested: string;
  description: string;
  customerLocation: string;
  preferredDate: string;
  additionalInfo: string;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EnquiryPayload {
  providerId: string;
  serviceRequested: string;
  description: string;
  customerLocation: string;
  preferredDate: string;
  additionalInfo: string;
}

export type NotificationType =
  | 'post_like'
  | 'post_comment'
  | 'enquiry_received'
  | 'enquiry_accepted'
  | 'enquiry_declined'
  | 'enquiry_completed'
  | 'enquiry_cancelled';

export interface NotificationItem {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorAvatarUrl: string | null;
  type: NotificationType;
  relatedPostId: string | null;
  relatedEnquiryId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

