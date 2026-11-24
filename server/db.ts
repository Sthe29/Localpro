import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface DbUser {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  province: string;
  city: string;
  suburb: string | null;
  bio: string | null;
  avatar_url: string | null;
  service_location: string | null;
  has_skills: number;
  skill_description: string | null;
  email_verified?: number;
  created_at: string;
}

export interface DbSkill {
  id: number;
  name: string;
  category: string;
}

export interface DbCategory {
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
  skills: DbSkill[];
  customSkills: string[];
  stats: ProfileStats;
}

export interface PrivateUserProfile extends PublicProfile {
  email: string;
  emailVerified: boolean;
}

export interface PostView {
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

export interface CommentView {
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

export type EnquiryStatus = 'Pending' | 'Accepted' | 'Declined' | 'Completed' | 'Cancelled';

export interface EnquiryView {
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

export type NotificationType =
  | 'post_like'
  | 'post_comment'
  | 'enquiry_received'
  | 'enquiry_accepted'
  | 'enquiry_declined'
  | 'enquiry_completed'
  | 'enquiry_cancelled';

export interface NotificationView {
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

const PREDEFINED_CATEGORIES: string[] = [
  'Beauty',
  'Construction and Home Services',
  'Technology',
  'Automotive',
  'Education',
  'Creative Services',
  'Other',
];

const PREDEFINED_SKILLS: Array<{ category: string; name: string }> = [
  // Beauty
  { category: 'Beauty', name: 'Hairdresser' },
  { category: 'Beauty', name: 'Barber' },
  { category: 'Beauty', name: 'Nail technician' },
  { category: 'Beauty', name: 'Makeup artist' },
  // Construction and Home Services
  { category: 'Construction and Home Services', name: 'Plumber' },
  { category: 'Construction and Home Services', name: 'Electrician' },
  { category: 'Construction and Home Services', name: 'Painter' },
  { category: 'Construction and Home Services', name: 'Carpenter' },
  { category: 'Construction and Home Services', name: 'Cleaner' },
  // Technology
  { category: 'Technology', name: 'Web developer' },
  { category: 'Technology', name: 'Graphic designer' },
  { category: 'Technology', name: 'IT support' },
  { category: 'Technology', name: 'Computer technician' },
  // Automotive
  { category: 'Automotive', name: 'Mechanic' },
  { category: 'Automotive', name: 'Car wash' },
  { category: 'Automotive', name: 'Panel beater' },
  // Education
  { category: 'Education', name: 'Tutor' },
  { category: 'Education', name: 'Music teacher' },
  { category: 'Education', name: 'Academic assistance' },
  // Creative Services
  { category: 'Creative Services', name: 'Photographer' },
  { category: 'Creative Services', name: 'Videographer' },
  { category: 'Creative Services', name: 'Baker' },
  { category: 'Creative Services', name: 'Fashion designer' },
];

const configuredDbPath = process.env.LOCALPRO_DB_PATH?.trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.resolve(process.cwd(), 'localpro.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Configure SQLite for safe concurrent reads/writes and relational integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize relational schema across Auth, Profiles, Posts, Categories, Likes, and Comments
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    province TEXT NOT NULL,
    city TEXT NOT NULL,
    suburb TEXT,
    bio TEXT,
    avatar_url TEXT,
    service_location TEXT,
    has_skills INTEGER NOT NULL DEFAULT 0,
    skill_description TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_skills (
    user_id TEXT NOT NULL,
    skill_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, skill_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    custom_skill_name TEXT NOT NULL,
    UNIQUE (user_id, custom_skill_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    province TEXT NOT NULL,
    city TEXT NOT NULL,
    suburb TEXT,
    price_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS post_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    service_requested TEXT NOT NULL,
    description TEXT NOT NULL,
    customer_location TEXT NOT NULL,
    preferred_date TEXT,
    additional_info TEXT,
    status TEXT NOT NULL DEFAULT 'Pending'
      CHECK (status IN ('Pending', 'Accepted', 'Declined', 'Completed', 'Cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_user_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
      type IN (
        'post_like',
        'post_comment',
        'enquiry_received',
        'enquiry_accepted',
        'enquiry_declined',
        'enquiry_completed',
        'enquiry_cancelled'
      )
    ),
    related_post_id TEXT,
    related_enquiry_id TEXT,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (related_enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_change_requests (
    user_id TEXT PRIMARY KEY,
    new_email TEXT NOT NULL COLLATE NOCASE,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS security_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_user_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('post', 'user')),
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Reviewed', 'Dismissed')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
  CREATE INDEX IF NOT EXISTS idx_posts_location ON posts(province, city);
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
  CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_enquiries_customer ON enquiries(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_enquiries_provider ON enquiries(provider_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, is_read, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, revoked_at, expires_at);
  CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at);
  CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id, used_at);
  CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id, reporter_user_id);
`);

// Safe additive migration for existing databases created in Module 01
const existingColumns = db
  .prepare('PRAGMA table_info(users)')
  .all() as Array<{ name: string }>;
const columnSet = new Set(existingColumns.map((col) => col.name));

if (!columnSet.has('bio')) {
  db.exec('ALTER TABLE users ADD COLUMN bio TEXT');
}
if (!columnSet.has('avatar_url')) {
  db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
}
if (!columnSet.has('service_location')) {
  db.exec('ALTER TABLE users ADD COLUMN service_location TEXT');
}
if (!columnSet.has('email_verified')) {
  db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
}

// Seed predefined skills & categories idempotently
const insertSkillStmt = db.prepare(
  'INSERT OR IGNORE INTO skills (name, category) VALUES (?, ?)'
);
const insertCategoryStmt = db.prepare(
  'INSERT OR IGNORE INTO categories (name) VALUES (?)'
);
const seedTx = db.transaction(() => {
  for (const skill of PREDEFINED_SKILLS) {
    insertSkillStmt.run(skill.name, skill.category);
  }
  for (const categoryName of PREDEFINED_CATEGORIES) {
    insertCategoryStmt.run(categoryName);
  }
});
seedTx();

export function getAllSkills(): DbSkill[] {
  return db
    .prepare('SELECT id, name, category FROM skills ORDER BY id ASC')
    .all() as DbSkill[];
}

export function getAllCategories(): DbCategory[] {
  return db
    .prepare('SELECT id, name FROM categories ORDER BY id ASC')
    .all() as DbCategory[];
}

export function findCategoryById(id: number): DbCategory | undefined {
  return db
    .prepare('SELECT id, name FROM categories WHERE id = ?')
    .get(id) as DbCategory | undefined;
}

export function findUserByEmail(email: string): DbUser | undefined {
  return db
    .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
    .get(email) as DbUser | undefined;
}

export function findUserById(id: string): DbUser | undefined {
  return db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id) as DbUser | undefined;
}

function getSkillsForUser(userId: string): { skills: DbSkill[]; customSkills: string[] } {
  const skills = db
    .prepare(
      `SELECT s.id, s.name, s.category
       FROM skills s
       INNER JOIN user_skills us ON us.skill_id = s.id
       WHERE us.user_id = ?
       ORDER BY s.id ASC`
    )
    .all(userId) as DbSkill[];

  const customSkillRows = db
    .prepare(
      `SELECT custom_skill_name
       FROM custom_skills
       WHERE user_id = ?
       ORDER BY id ASC`
    )
    .all(userId) as Array<{ custom_skill_name: string }>;

  return {
    skills,
    customSkills: customSkillRows.map((row) => row.custom_skill_name),
  };
}

function getProfileStats(userId: string): ProfileStats {
  const postsRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM posts WHERE author_id = ?')
    .get(userId) as { cnt: number };

  const likesRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM likes l
       INNER JOIN posts p ON p.id = l.post_id
       WHERE p.author_id = ?`
    )
    .get(userId) as { cnt: number };

  const commentsRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM comments c
       INNER JOIN posts p ON p.id = c.post_id
       WHERE p.author_id = ?`
    )
    .get(userId) as { cnt: number };

  const totalPosts = postsRow?.cnt ?? 0;
  const totalLikes = likesRow?.cnt ?? 0;
  const totalCommentsReceived = commentsRow?.cnt ?? 0;

  return {
    totalPosts,
    totalLikes,
    engagementCount: totalLikes + totalCommentsReceived,
  };
}

function mapUserToPublicProfile(user: DbUser): PublicProfile {
  const { skills, customSkills } = getSkillsForUser(user.id);
  const defaultLocation = [user.suburb, user.city, user.province].filter(Boolean).join(', ');
  return {
    id: user.id,
    fullName: user.full_name,
    province: user.province,
    city: user.city,
    suburb: user.suburb ?? '',
    bio: user.bio ?? '',
    avatarUrl: user.avatar_url ?? null,
    serviceLocation: user.service_location?.trim() || defaultLocation,
    hasSkills: user.has_skills === 1,
    skillDescription: user.skill_description ?? '',
    createdAt: user.created_at,
    skills,
    customSkills,
    stats: getProfileStats(user.id),
  };
}

// Private profile for the authenticated owner (includes email)
export function getPrivateUserProfile(userId: string): PrivateUserProfile | null {
  const user = findUserById(userId);
  if (!user) return null;
  return {
    ...mapUserToPublicProfile(user),
    email: user.email,
    emailVerified: (user.email_verified ?? 0) === 1,
  };
}

// Public profile view (never exposes email or password_hash)
export function getPublicUserProfile(userId: string): PublicProfile | null {
  const user = findUserById(userId);
  if (!user) return null;
  return mapUserToPublicProfile(user);
}

// Search & filter providers for Explore (Module 05) using genuine database records
export function searchPublicProfiles(filters: {
  excludeUserId?: string;
  query?: string;
  province?: string;
  city?: string;
  suburb?: string;
  category?: string;
  skill?: string;
  limit?: number;
}): PublicProfile[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.excludeUserId) {
    conditions.push('u.id != ?');
    params.push(filters.excludeUserId);
  }

  if (filters.province) {
    conditions.push('LOWER(u.province) = LOWER(?)');
    params.push(filters.province);
  }

  if (filters.city) {
    conditions.push('LOWER(u.city) LIKE LOWER(?)');
    params.push(`%${filters.city}%`);
  }

  if (filters.suburb) {
    conditions.push('LOWER(COALESCE(u.suburb, \'\')) LIKE LOWER(?)');
    params.push(`%${filters.suburb}%`);
  }

  if (filters.category) {
    if (filters.category.toLowerCase() === 'other') {
      conditions.push(
        'EXISTS (SELECT 1 FROM custom_skills cs WHERE cs.user_id = u.id)'
      );
    } else {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM user_skills us
          INNER JOIN skills s ON s.id = us.skill_id
          WHERE us.user_id = u.id AND LOWER(s.category) = LOWER(?)
        )
      `);
      params.push(filters.category);
    }
  }

  if (filters.skill) {
    conditions.push(`(
      EXISTS (
        SELECT 1
        FROM user_skills us
        INNER JOIN skills s ON s.id = us.skill_id
        WHERE us.user_id = u.id AND LOWER(s.name) LIKE LOWER(?)
      )
      OR EXISTS (
        SELECT 1
        FROM custom_skills cs
        WHERE cs.user_id = u.id AND LOWER(cs.custom_skill_name) LIKE LOWER(?)
      )
    )`);
    params.push(`%${filters.skill}%`, `%${filters.skill}%`);
  }

  if (filters.query) {
    const stopWords = new Set(['find', 'a', 'an', 'the', 'in', 'for', 'near', 'search', 'with', 'of', 'on', 'at']);
    const rawTokens = filters.query
      .toLowerCase()
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !stopWords.has(t));

    const tokens = rawTokens.length > 0 ? rawTokens.slice(0, 6) : [filters.query.toLowerCase().trim()];

    for (const token of tokens) {
      // Allow basic plural queries like "plumbers" or "technicians" to match singular DB skill names
      const normalizedToken =
        token.length > 4 && token.endsWith('s') && !token.endsWith('ss')
          ? token.slice(0, -1)
          : token;
      const q = `%${normalizedToken}%`;
      conditions.push(`(
        LOWER(u.full_name) LIKE ?
        OR LOWER(COALESCE(u.bio, '')) LIKE ?
        OR LOWER(COALESCE(u.skill_description, '')) LIKE ?
        OR LOWER(u.province) LIKE ?
        OR LOWER(u.city) LIKE ?
        OR LOWER(COALESCE(u.suburb, '')) LIKE ?
        OR EXISTS (
          SELECT 1
          FROM user_skills us
          INNER JOIN skills s ON s.id = us.skill_id
          WHERE us.user_id = u.id AND (
            LOWER(s.name) LIKE ? OR LOWER(s.category) LIKE ?
          )
        )
        OR EXISTS (
          SELECT 1
          FROM custom_skills cs
          WHERE cs.user_id = u.id AND LOWER(cs.custom_skill_name) LIKE ?
        )
      )`);
      params.push(q, q, q, q, q, q, q, q, q);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT u.*
       FROM users u
       ${whereClause}
       ORDER BY u.has_skills DESC, u.created_at DESC
       LIMIT ?`
    )
    .all(...params) as DbUser[];

  return rows.map(mapUserToPublicProfile);
}

export function getRecentlyActiveProviders(limit = 6): PublicProfile[] {
  const rows = db
    .prepare(
      `SELECT u.*,
        COALESCE(MAX(p.created_at), u.created_at) AS activity_ts
       FROM users u
       LEFT JOIN posts p ON p.author_id = u.id
       WHERE u.has_skills = 1
       GROUP BY u.id
       ORDER BY activity_ts DESC
       LIMIT ?`
    )
    .all(limit) as DbUser[];
  return rows.map(mapUserToPublicProfile);
}

export function getProvidersInArea(params: {
  userId: string;
  city: string;
  province: string;
  limit?: number;
}): PublicProfile[] {
  const limit = Math.min(Math.max(params.limit ?? 6, 1), 20);
  const rows = db
    .prepare(
      `SELECT u.*
       FROM users u
       WHERE u.id != ? AND u.has_skills = 1 AND LOWER(u.province) = LOWER(?)
       ORDER BY
         CASE WHEN LOWER(u.city) = LOWER(?) THEN 0 ELSE 1 END ASC,
         u.created_at DESC
       LIMIT ?`
    )
    .all(params.userId, params.province, params.city, limit) as DbUser[];
  return rows.map(mapUserToPublicProfile);
}

export function createUserWithSkills(params: {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  province: string;
  city: string;
  suburb: string;
  hasSkills: boolean;
  skillDescription: string;
  skillIds: number[];
  customSkills: string[];
  createdAt: string;
}): PrivateUserProfile {
  const insertUser = db.prepare(`
    INSERT INTO users (
      id, full_name, email, password_hash, province, city, suburb, bio, avatar_url, service_location, has_skills, skill_description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
  `);

  const insertUserSkill = db.prepare(
    'INSERT OR IGNORE INTO user_skills (user_id, skill_id) VALUES (?, ?)'
  );

  const insertCustomSkill = db.prepare(
    'INSERT OR IGNORE INTO custom_skills (user_id, custom_skill_name) VALUES (?, ?)'
  );

  const tx = db.transaction(() => {
    insertUser.run(
      params.id,
      params.fullName,
      params.email,
      params.passwordHash,
      params.province,
      params.city,
      params.suburb || null,
      params.hasSkills ? 1 : 0,
      params.hasSkills && params.skillDescription ? params.skillDescription : null,
      params.createdAt
    );

    if (params.hasSkills) {
      for (const skillId of params.skillIds) {
        insertUserSkill.run(params.id, skillId);
      }
      for (const customSkillName of params.customSkills) {
        insertCustomSkill.run(params.id, customSkillName);
      }
    }
  });

  tx();
  const profile = getPrivateUserProfile(params.id);
  if (!profile) {
    throw new Error('Failed to load newly created user profile');
  }
  return profile;
}

export function updateUserSkills(params: {
  userId: string;
  hasSkills: boolean;
  skillDescription: string;
  skillIds: number[];
  customSkills: string[];
}): PrivateUserProfile | null {
  const updateUserStmt = db.prepare(
    'UPDATE users SET has_skills = ?, skill_description = ? WHERE id = ?'
  );
  const deleteUserSkillsStmt = db.prepare('DELETE FROM user_skills WHERE user_id = ?');
  const deleteCustomSkillsStmt = db.prepare('DELETE FROM custom_skills WHERE user_id = ?');
  const insertUserSkillStmt = db.prepare(
    'INSERT OR IGNORE INTO user_skills (user_id, skill_id) VALUES (?, ?)'
  );
  const insertCustomSkillStmt = db.prepare(
    'INSERT OR IGNORE INTO custom_skills (user_id, custom_skill_name) VALUES (?, ?)'
  );

  const tx = db.transaction(() => {
    updateUserStmt.run(
      params.hasSkills ? 1 : 0,
      params.hasSkills && params.skillDescription ? params.skillDescription : null,
      params.userId
    );
    deleteUserSkillsStmt.run(params.userId);
    deleteCustomSkillsStmt.run(params.userId);

    if (params.hasSkills) {
      for (const skillId of params.skillIds) {
        insertUserSkillStmt.run(params.userId, skillId);
      }
      for (const customSkillName of params.customSkills) {
        insertCustomSkillStmt.run(params.userId, customSkillName);
      }
    }
  });

  tx();
  return getPrivateUserProfile(params.userId);
}

export function updateUserProfile(params: {
  userId: string;
  fullName: string;
  bio: string;
  province: string;
  city: string;
  suburb: string;
  serviceLocation: string;
  hasSkills: boolean;
  skillDescription: string;
  skillIds: number[];
  customSkills: string[];
}): PrivateUserProfile | null {
  const updateUserStmt = db.prepare(`
    UPDATE users
    SET
      full_name = ?,
      bio = ?,
      province = ?,
      city = ?,
      suburb = ?,
      service_location = ?,
      has_skills = ?,
      skill_description = ?
    WHERE id = ?
  `);

  const deleteUserSkillsStmt = db.prepare('DELETE FROM user_skills WHERE user_id = ?');
  const deleteCustomSkillsStmt = db.prepare('DELETE FROM custom_skills WHERE user_id = ?');
  const insertUserSkillStmt = db.prepare(
    'INSERT OR IGNORE INTO user_skills (user_id, skill_id) VALUES (?, ?)'
  );
  const insertCustomSkillStmt = db.prepare(
    'INSERT OR IGNORE INTO custom_skills (user_id, custom_skill_name) VALUES (?, ?)'
  );

  const tx = db.transaction(() => {
    updateUserStmt.run(
      params.fullName,
      params.bio || null,
      params.province,
      params.city,
      params.suburb || null,
      params.serviceLocation || null,
      params.hasSkills ? 1 : 0,
      params.hasSkills && params.skillDescription ? params.skillDescription : null,
      params.userId
    );
    deleteUserSkillsStmt.run(params.userId);
    deleteCustomSkillsStmt.run(params.userId);

    if (params.hasSkills) {
      for (const skillId of params.skillIds) {
        insertUserSkillStmt.run(params.userId, skillId);
      }
      for (const customSkillName of params.customSkills) {
        insertCustomSkillStmt.run(params.userId, customSkillName);
      }
    }
  });

  tx();
  return getPrivateUserProfile(params.userId);
}

export function updateUserAvatarUrl(userId: string, avatarUrl: string | null): PrivateUserProfile | null {
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
  return getPrivateUserProfile(userId);
}

// ======================================================
// POSTS, POST IMAGES, LIKES, AND COMMENTS QUERIES
// ======================================================

interface RawPostRow {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  category_id: number;
  category_name: string;
  description: string;
  province: string;
  city: string;
  suburb: string | null;
  price_text: string | null;
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: number;
}

function hydratePosts(rows: RawPostRow[], viewerUserId: string): PostView[] {
  if (rows.length === 0) return [];

  const getImagesStmt = db.prepare(
    'SELECT image_url FROM post_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC'
  );

  return rows.map((row) => {
    const imgRows = getImagesStmt.all(row.id) as Array<{ image_url: string }>;
    return {
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name,
      authorAvatarUrl: row.author_avatar_url ?? null,
      categoryId: row.category_id,
      categoryName: row.category_name,
      description: row.description,
      province: row.province,
      city: row.city,
      suburb: row.suburb ?? '',
      priceText: row.price_text ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      images: imgRows.map((img) => img.image_url),
      likeCount: row.like_count ?? 0,
      commentCount: row.comment_count ?? 0,
      likedByMe: row.liked_by_me > 0,
      isAuthor: row.author_id === viewerUserId,
    };
  });
}

export function getPostById(postId: string, viewerUserId: string): PostView | null {
  const row = db
    .prepare(
      `SELECT
         p.id,
         p.author_id,
         u.full_name AS author_name,
         u.avatar_url AS author_avatar_url,
         p.category_id,
         c.name AS category_name,
         p.description,
         p.province,
         p.city,
         p.suburb,
         p.price_text,
         p.created_at,
         p.updated_at,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
         (SELECT COUNT(*) FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) AS liked_by_me
       FROM posts p
       INNER JOIN users u ON u.id = p.author_id
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`
    )
    .get(viewerUserId, postId) as RawPostRow | undefined;

  if (!row) return null;
  return hydratePosts([row], viewerUserId)[0];
}

export function getFeedPosts(options: {
  viewerUserId: string;
  viewerProvince: string;
  viewerCity: string;
  viewerSuburb: string;
  scope: 'near' | 'city' | 'kzn' | 'everywhere';
  categoryId?: number;
  authorId?: string;
  sort: 'recent' | 'liked';
  limit: number;
  offset: number;
}): { posts: PostView[]; totalCount: number } {
  const conditions: string[] = [];
  const whereParams: Array<string | number> = [];

  if (options.authorId) {
    conditions.push('p.author_id = ?');
    whereParams.push(options.authorId);
  }

  if (options.categoryId && Number.isInteger(options.categoryId)) {
    conditions.push('p.category_id = ?');
    whereParams.push(options.categoryId);
  }

  if (options.scope === 'city') {
    conditions.push('LOWER(p.city) = LOWER(?)');
    whereParams.push(options.viewerCity);
  } else if (options.scope === 'kzn') {
    conditions.push("LOWER(p.province) = 'kwazulu-natal'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM posts p ${whereClause}`)
    .get(...whereParams) as { cnt: number };
  const totalCount = countRow?.cnt ?? 0;

  // Location priority score:
  // 0 = exact suburb + city match, 1 = same city, 2 = same province, 3 = other
  const locationRankExpr = `
    CASE
      WHEN ? != '' AND LOWER(COALESCE(p.suburb, '')) = LOWER(?) AND LOWER(p.city) = LOWER(?) THEN 0
      WHEN LOWER(p.city) = LOWER(?) THEN 1
      WHEN LOWER(p.province) = LOWER(?) THEN 2
      ELSE 3
    END
  `;

  let orderByClause = '';
  if (options.sort === 'liked') {
    orderByClause =
      options.scope === 'near'
        ? `like_count DESC, location_rank ASC, p.created_at DESC`
        : `like_count DESC, p.created_at DESC`;
  } else {
    orderByClause =
      options.scope === 'near'
        ? `location_rank ASC, p.created_at DESC`
        : `p.created_at DESC`;
  }

  const queryParams: Array<string | number> = [
    options.viewerUserId,
    options.viewerSuburb,
    options.viewerSuburb,
    options.viewerCity,
    options.viewerCity,
    options.viewerProvince,
    ...whereParams,
    options.limit,
    options.offset,
  ];

  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.author_id,
         u.full_name AS author_name,
         u.avatar_url AS author_avatar_url,
         p.category_id,
         c.name AS category_name,
         p.description,
         p.province,
         p.city,
         p.suburb,
         p.price_text,
         p.created_at,
         p.updated_at,
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
         (SELECT COUNT(*) FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) AS liked_by_me,
         (${locationRankExpr}) AS location_rank
       FROM posts p
       INNER JOIN users u ON u.id = p.author_id
       INNER JOIN categories c ON c.id = p.category_id
       ${whereClause}
       ORDER BY ${orderByClause}
       LIMIT ? OFFSET ?`
    )
    .all(...queryParams) as RawPostRow[];

  return {
    posts: hydratePosts(rows, options.viewerUserId),
    totalCount,
  };
}

export function createPost(params: {
  id: string;
  authorId: string;
  categoryId: number;
  description: string;
  province: string;
  city: string;
  suburb: string;
  priceText: string;
  images: string[];
  createdAt: string;
}): PostView {
  const insertPost = db.prepare(`
    INSERT INTO posts (
      id, author_id, category_id, description, province, city, suburb, price_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertImage = db.prepare(`
    INSERT INTO post_images (post_id, image_url, sort_order) VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertPost.run(
      params.id,
      params.authorId,
      params.categoryId,
      params.description,
      params.province,
      params.city,
      params.suburb || null,
      params.priceText || null,
      params.createdAt,
      params.createdAt
    );

    params.images.forEach((url, index) => {
      insertImage.run(params.id, url, index);
    });
  });

  tx();
  const created = getPostById(params.id, params.authorId);
  if (!created) {
    throw new Error('Failed to load newly created post');
  }
  return created;
}

export function updatePost(params: {
  postId: string;
  authorId: string;
  categoryId: number;
  description: string;
  province: string;
  city: string;
  suburb: string;
  priceText: string;
  images: string[];
  updatedAt: string;
}): { post: PostView; removedImages: string[] } | null {
  const existing = db
    .prepare('SELECT id, author_id FROM posts WHERE id = ?')
    .get(params.postId) as { id: string; author_id: string } | undefined;

  if (!existing) return null;

  const oldImages = (
    db.prepare('SELECT image_url FROM post_images WHERE post_id = ?').all(params.postId) as Array<{
      image_url: string;
    }>
  ).map((row) => row.image_url);

  const nextSet = new Set(params.images);
  const removedImages = oldImages.filter((url) => !nextSet.has(url));

  const updateStmt = db.prepare(`
    UPDATE posts
    SET category_id = ?, description = ?, province = ?, city = ?, suburb = ?, price_text = ?, updated_at = ?
    WHERE id = ? AND author_id = ?
  `);
  const deleteImagesStmt = db.prepare('DELETE FROM post_images WHERE post_id = ?');
  const insertImageStmt = db.prepare(
    'INSERT INTO post_images (post_id, image_url, sort_order) VALUES (?, ?, ?)'
  );

  const tx = db.transaction(() => {
    updateStmt.run(
      params.categoryId,
      params.description,
      params.province,
      params.city,
      params.suburb || null,
      params.priceText || null,
      params.updatedAt,
      params.postId,
      params.authorId
    );
    deleteImagesStmt.run(params.postId);
    params.images.forEach((url, idx) => {
      insertImageStmt.run(params.postId, url, idx);
    });
  });

  tx();
  const updated = getPostById(params.postId, params.authorId);
  if (!updated) return null;
  return { post: updated, removedImages };
}

export function deletePostById(postId: string): { deletedImages: string[] } {
  const imageRows = db
    .prepare('SELECT image_url FROM post_images WHERE post_id = ?')
    .all(postId) as Array<{ image_url: string }>;

  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
  return { deletedImages: imageRows.map((row) => row.image_url) };
}

export function getRawPostOwner(postId: string): { id: string; author_id: string } | undefined {
  return db
    .prepare('SELECT id, author_id FROM posts WHERE id = ?')
    .get(postId) as { id: string; author_id: string } | undefined;
}

export function togglePostLike(userId: string, postId: string): { liked: boolean; likeCount: number } {
  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM likes WHERE user_id = ? AND post_id = ?')
      .get(userId, postId) as { id: number } | undefined;

    let liked = false;
    if (existing) {
      db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(userId, postId);
      liked = false;
    } else {
      db.prepare('INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)').run(
        userId,
        postId,
        new Date().toISOString()
      );
      liked = true;
    }

    const countRow = db
      .prepare('SELECT COUNT(*) AS cnt FROM likes WHERE post_id = ?')
      .get(postId) as { cnt: number };

    return { liked, likeCount: countRow?.cnt ?? 0 };
  });

  return tx();
}

export function getCommentsForPost(postId: string, viewerUserId: string): CommentView[] {
  const postOwner = getRawPostOwner(postId);
  const postAuthorId = postOwner?.author_id ?? '';

  const rows = db
    .prepare(
      `SELECT
         c.id,
         c.post_id,
         c.user_id,
         u.full_name AS author_name,
         u.avatar_url AS author_avatar_url,
         c.comment_text,
         c.created_at,
         c.updated_at
       FROM comments c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(postId) as Array<{
    id: string;
    post_id: string;
    user_id: string;
    author_name: string;
    author_avatar_url: string | null;
    comment_text: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url ?? null,
    commentText: row.comment_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canEdit: row.user_id === viewerUserId,
    canDelete: row.user_id === viewerUserId || postAuthorId === viewerUserId,
  }));
}

export function getPostCommentCount(postId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM comments WHERE post_id = ?')
    .get(postId) as { cnt: number };
  return row?.cnt ?? 0;
}

export function createComment(params: {
  id: string;
  postId: string;
  userId: string;
  commentText: string;
  createdAt: string;
}): CommentView {
  db.prepare(
    `INSERT INTO comments (id, user_id, post_id, comment_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.userId,
    params.postId,
    params.commentText,
    params.createdAt,
    params.createdAt
  );

  const comments = getCommentsForPost(params.postId, params.userId);
  const created = comments.find((c) => c.id === params.id);
  if (!created) {
    throw new Error('Failed to load newly created comment');
  }
  return created;
}

export function getRawComment(commentId: string): {
  id: string;
  user_id: string;
  post_id: string;
} | undefined {
  return db
    .prepare('SELECT id, user_id, post_id FROM comments WHERE id = ?')
    .get(commentId) as { id: string; user_id: string; post_id: string } | undefined;
}

export function updateCommentText(params: {
  commentId: string;
  userId: string;
  commentText: string;
  updatedAt: string;
}): CommentView | null {
  const existing = getRawComment(params.commentId);
  if (!existing || existing.user_id !== params.userId) {
    return null;
  }

  db.prepare('UPDATE comments SET comment_text = ?, updated_at = ? WHERE id = ?').run(
    params.commentText,
    params.updatedAt,
    params.commentId
  );

  const comments = getCommentsForPost(existing.post_id, params.userId);
  return comments.find((c) => c.id === params.commentId) ?? null;
}

export function deleteCommentById(commentId: string): void {
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
}

export function getCategoryCounts(): Array<{ id: number; name: string; postCount: number }> {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(p.id) AS postCount
       FROM categories c
       LEFT JOIN posts p ON p.category_id = c.id
       GROUP BY c.id
       ORDER BY c.id ASC`
    )
    .all() as Array<{ id: number; name: string; postCount: number }>;
}

// ============================================================================
// MODULE 07: CUSTOMER ENQUIRIES AND SERVICE CONNECTIONS
// ============================================================================

interface RawEnquiryRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_avatar_url: string | null;
  provider_id: string;
  provider_name: string;
  provider_avatar_url: string | null;
  provider_province: string;
  provider_city: string;
  provider_suburb: string | null;
  service_requested: string;
  description: string;
  customer_location: string;
  preferred_date: string | null;
  additional_info: string | null;
  status: EnquiryStatus;
  created_at: string;
  updated_at: string;
}

function mapEnquiryRow(row: RawEnquiryRow): EnquiryView {
  const providerLocation = [row.provider_suburb, row.provider_city, row.provider_province]
    .filter(Boolean)
    .join(', ');
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAvatarUrl: row.customer_avatar_url ?? null,
    providerId: row.provider_id,
    providerName: row.provider_name,
    providerAvatarUrl: row.provider_avatar_url ?? null,
    providerLocation,
    serviceRequested: row.service_requested,
    description: row.description,
    customerLocation: row.customer_location,
    preferredDate: row.preferred_date ?? '',
    additionalInfo: row.additional_info ?? '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ENQUIRY_SELECT_SQL = `
  SELECT
    e.id,
    e.customer_id,
    cu.full_name AS customer_name,
    cu.avatar_url AS customer_avatar_url,
    e.provider_id,
    pu.full_name AS provider_name,
    pu.avatar_url AS provider_avatar_url,
    pu.province AS provider_province,
    pu.city AS provider_city,
    pu.suburb AS provider_suburb,
    e.service_requested,
    e.description,
    e.customer_location,
    e.preferred_date,
    e.additional_info,
    e.status,
    e.created_at,
    e.updated_at
  FROM enquiries e
  INNER JOIN users cu ON cu.id = e.customer_id
  INNER JOIN users pu ON pu.id = e.provider_id
`;

export function createEnquiry(params: {
  id: string;
  customerId: string;
  providerId: string;
  serviceRequested: string;
  description: string;
  customerLocation: string;
  preferredDate: string;
  additionalInfo: string;
  createdAt: string;
}): EnquiryView {
  db.prepare(
    `INSERT INTO enquiries (
       id, customer_id, provider_id, service_requested, description,
       customer_location, preferred_date, additional_info, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`
  ).run(
    params.id,
    params.customerId,
    params.providerId,
    params.serviceRequested,
    params.description,
    params.customerLocation,
    params.preferredDate || null,
    params.additionalInfo || null,
    params.createdAt,
    params.createdAt
  );

  const created = getEnquiryById(params.id);
  if (!created) {
    throw new Error('Failed to load newly created enquiry');
  }
  return created;
}

export function getEnquiryById(enquiryId: string): EnquiryView | null {
  const row = db
    .prepare(`${ENQUIRY_SELECT_SQL} WHERE e.id = ?`)
    .get(enquiryId) as RawEnquiryRow | undefined;
  return row ? mapEnquiryRow(row) : null;
}

export function getRawEnquiryById(enquiryId: string): {
  id: string;
  customer_id: string;
  provider_id: string;
  service_requested: string;
  status: EnquiryStatus;
} | undefined {
  return db
    .prepare(
      'SELECT id, customer_id, provider_id, service_requested, status FROM enquiries WHERE id = ?'
    )
    .get(enquiryId) as
    | {
        id: string;
        customer_id: string;
        provider_id: string;
        service_requested: string;
        status: EnquiryStatus;
      }
    | undefined;
}

export function getEnquiriesForCustomer(customerId: string): EnquiryView[] {
  const rows = db
    .prepare(`${ENQUIRY_SELECT_SQL} WHERE e.customer_id = ? ORDER BY e.created_at DESC`)
    .all(customerId) as RawEnquiryRow[];
  return rows.map(mapEnquiryRow);
}

export function getEnquiriesForProvider(providerId: string): EnquiryView[] {
  const rows = db
    .prepare(`${ENQUIRY_SELECT_SQL} WHERE e.provider_id = ? ORDER BY e.created_at DESC`)
    .all(providerId) as RawEnquiryRow[];
  return rows.map(mapEnquiryRow);
}

export function updateEnquiryStatus(
  enquiryId: string,
  nextStatus: EnquiryStatus,
  updatedAt: string
): EnquiryView | null {
  db.prepare('UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    updatedAt,
    enquiryId
  );
  return getEnquiryById(enquiryId);
}

// ============================================================================
// MODULE 08: NOTIFICATIONS
// ============================================================================

interface RawNotificationRow {
  id: string;
  recipient_user_id: string;
  actor_user_id: string;
  actor_name: string;
  actor_avatar_url: string | null;
  type: NotificationType;
  related_post_id: string | null;
  related_enquiry_id: string | null;
  message: string;
  is_read: number;
  created_at: string;
}

function mapNotificationRow(row: RawNotificationRow): NotificationView {
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    actorAvatarUrl: row.actor_avatar_url ?? null,
    type: row.type,
    relatedPostId: row.related_post_id ?? null,
    relatedEnquiryId: row.related_enquiry_id ?? null,
    message: row.message,
    isRead: row.is_read > 0,
    createdAt: row.created_at,
  };
}

export function hasRecentLikeNotification(
  recipientUserId: string,
  actorUserId: string,
  postId: string
): boolean {
  const row = db
    .prepare(
      `SELECT id FROM notifications
       WHERE recipient_user_id = ? AND actor_user_id = ? AND type = 'post_like' AND related_post_id = ?
       LIMIT 1`
    )
    .get(recipientUserId, actorUserId, postId) as { id: string } | undefined;
  return Boolean(row);
}

export function createNotification(params: {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  relatedPostId?: string | null;
  relatedEnquiryId?: string | null;
  message: string;
  createdAt: string;
  isRead?: boolean;
}): NotificationView {
  db.prepare(
    `INSERT INTO notifications (
       id, recipient_user_id, actor_user_id, type,
       related_post_id, related_enquiry_id, message, is_read, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.recipientUserId,
    params.actorUserId,
    params.type,
    params.relatedPostId ?? null,
    params.relatedEnquiryId ?? null,
    params.message,
    params.isRead ? 1 : 0,
    params.createdAt
  );

  const row = db
    .prepare(
      `SELECT
         n.id, n.recipient_user_id, n.actor_user_id,
         au.full_name AS actor_name, au.avatar_url AS actor_avatar_url,
         n.type, n.related_post_id, n.related_enquiry_id,
         n.message, n.is_read, n.created_at
       FROM notifications n
       INNER JOIN users au ON au.id = n.actor_user_id
       WHERE n.id = ?`
    )
    .get(params.id) as RawNotificationRow;

  return mapNotificationRow(row);
}

export function getNotificationsForUser(userId: string, limit = 60): NotificationView[] {
  const rows = db
    .prepare(
      `SELECT
         n.id, n.recipient_user_id, n.actor_user_id,
         au.full_name AS actor_name, au.avatar_url AS actor_avatar_url,
         n.type, n.related_post_id, n.related_enquiry_id,
         n.message, n.is_read, n.created_at
       FROM notifications n
       INNER JOIN users au ON au.id = n.actor_user_id
       WHERE n.recipient_user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as RawNotificationRow[];

  return rows.map(mapNotificationRow);
}

export function getUnreadNotificationCount(userId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_user_id = ? AND is_read = 0')
    .get(userId) as { cnt: number };
  return row?.cnt ?? 0;
}

export function markNotificationAsRead(
  notificationId: string,
  userId: string
): 'updated' | 'not_found' | 'forbidden' {
  const existing = db
    .prepare('SELECT id, recipient_user_id FROM notifications WHERE id = ?')
    .get(notificationId) as { id: string; recipient_user_id: string } | undefined;

  if (!existing) return 'not_found';
  if (existing.recipient_user_id !== userId) return 'forbidden';

  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_user_id = ?').run(
    notificationId,
    userId
  );
  return 'updated';
}

export function markAllNotificationsAsRead(userId: string): number {
  const info = db
    .prepare('UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ? AND is_read = 0')
    .run(userId);
  return info.changes;
}

export function deleteNotificationById(
  notificationId: string,
  userId: string
): 'deleted' | 'not_found' | 'forbidden' {
  const existing = db
    .prepare('SELECT id, recipient_user_id FROM notifications WHERE id = ?')
    .get(notificationId) as { id: string; recipient_user_id: string } | undefined;

  if (!existing) return 'not_found';
  if (existing.recipient_user_id !== userId) return 'forbidden';

  db.prepare('DELETE FROM notifications WHERE id = ? AND recipient_user_id = ?').run(
    notificationId,
    userId
  );
  return 'deleted';
}

// ============================================================================
// MODULE 09+: SECURITY HARDENING (SESSIONS, RATE LIMITS, TOKENS, LOGS, REPORTS)
// ============================================================================

export interface DbSession {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: number;
  last_active_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export interface SessionView {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SecurityLogView {
  id: string;
  eventType: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReportView {
  id: string;
  targetType: 'post' | 'user';
  targetId: string;
  reason: string;
  status: 'Open' | 'Reviewed' | 'Dismissed';
  createdAt: string;
}

export function createSession(params: {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  ttlMs: number;
}): DbSession {
  const now = Date.now();
  const expiresAt = now + params.ttlMs;
  const safeUa = params.userAgent ? params.userAgent.slice(0, 220) : null;
  const safeIp = params.ipAddress ? params.ipAddress.slice(0, 64) : null;

  db.prepare(
    `INSERT INTO user_sessions (
       id, user_id, user_agent, ip_address, created_at, last_active_at, expires_at, revoked_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(params.id, params.userId, safeUa, safeIp, now, now, expiresAt);

  return {
    id: params.id,
    user_id: params.userId,
    user_agent: safeUa,
    ip_address: safeIp,
    created_at: now,
    last_active_at: now,
    expires_at: expiresAt,
    revoked_at: null,
  };
}

export function getActiveSessionById(
  sessionId: string,
  idleTimeoutMs: number
): DbSession | null {
  const row = db
    .prepare('SELECT * FROM user_sessions WHERE id = ?')
    .get(sessionId) as DbSession | undefined;

  if (!row || row.revoked_at !== null) {
    return null;
  }

  const now = Date.now();
  if (row.expires_at <= now || now - row.last_active_at > idleTimeoutMs) {
    db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(
      now,
      sessionId
    );
    return null;
  }

  return row;
}

export function touchSessionActivity(sessionId: string, throttleMs = 60_000): void {
  const now = Date.now();
  db.prepare(
    `UPDATE user_sessions
     SET last_active_at = ?
     WHERE id = ? AND revoked_at IS NULL AND (? - last_active_at) >= ?`
  ).run(now, sessionId, now, throttleMs);
}

export function revokeSessionById(sessionId: string, userId?: string): boolean {
  const now = Date.now();
  const info = userId
    ? db
        .prepare(
          'UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL'
        )
        .run(now, sessionId, userId)
    : db
        .prepare('UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
        .run(now, sessionId);
  return info.changes > 0;
}

export function revokeOtherUserSessions(userId: string, keepSessionId: string): number {
  const now = Date.now();
  const info = db
    .prepare(
      'UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL'
    )
    .run(now, userId, keepSessionId);
  return info.changes;
}

export function revokeAllUserSessions(userId: string): number {
  const now = Date.now();
  const info = db
    .prepare('UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(now, userId);
  return info.changes;
}

export function getUserActiveSessions(
  userId: string,
  currentSessionId: string,
  idleTimeoutMs: number
): SessionView[] {
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT * FROM user_sessions
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? AND (? - last_active_at) <= ?
       ORDER BY last_active_at DESC`
    )
    .all(userId, now, now, idleTimeoutMs) as DbSession[];

  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent || 'Web browser session',
    ipAddress: row.ip_address || 'Unknown',
    createdAt: new Date(row.created_at).toISOString(),
    lastActiveAt: new Date(row.last_active_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    isCurrent: row.id === currentSessionId,
  }));
}

export function consumeRateLimit(
  bucketKey: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const tx = db.transaction(() => {
    const now = Date.now();
    const row = db
      .prepare('SELECT count, reset_at FROM rate_limits WHERE bucket_key = ?')
      .get(bucketKey) as { count: number; reset_at: number } | undefined;

    if (!row || row.reset_at <= now) {
      const nextReset = now + windowMs;
      db.prepare(
        `INSERT INTO rate_limits (bucket_key, count, reset_at)
         VALUES (?, 1, ?)
         ON CONFLICT(bucket_key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
      ).run(bucketKey, nextReset);
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    if (row.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((row.reset_at - now) / 1000)),
      };
    }

    const nextCount = row.count + 1;
    db.prepare('UPDATE rate_limits SET count = ? WHERE bucket_key = ?').run(nextCount, bucketKey);
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - nextCount),
      retryAfterSeconds: Math.max(1, Math.ceil((row.reset_at - now) / 1000)),
    };
  });

  return tx();
}

export function updateUserPasswordHash(userId: string, nextPasswordHash: string): boolean {
  const info = db
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(nextPasswordHash, userId);
  return info.changes > 0;
}

export function createPasswordResetToken(params: {
  id: string;
  userId: string;
  tokenHash: string;
  ttlMs: number;
}): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(
      now,
      params.userId
    );
    db.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    ).run(params.id, params.userId, params.tokenHash, now + params.ttlMs, now);
  });
  tx();
}

export function getValidPasswordResetToken(tokenHash: string): {
  id: string;
  user_id: string;
  expires_at: number;
} | null {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT id, user_id, expires_at
       FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
    )
    .get(tokenHash, now) as { id: string; user_id: string; expires_at: number } | undefined;
  return row ?? null;
}

export function completePasswordResetToken(params: {
  tokenId: string;
  userId: string;
  newPasswordHash: string;
}): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, params.tokenId);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      params.newPasswordHash,
      params.userId
    );
    db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
      now,
      params.userId
    );
  });
  tx();
}

export function markUserEmailVerified(userId: string): void {
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
}

export function completeGooglePasswordReset(params: {
  userId: string;
  newPasswordHash: string;
}): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(
      params.newPasswordHash,
      params.userId
    );
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(
      now,
      params.userId
    );
    db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
      now,
      params.userId
    );
  });
  tx();
}

export function createEmailChangeRequest(params: {
  userId: string;
  newEmail: string;
  codeHash: string;
  ttlMs: number;
}): { newEmail: string; expiresAt: string } {
  const now = Date.now();
  const expiresAt = now + params.ttlMs;
  db.prepare(
    `INSERT INTO email_change_requests (user_id, new_email, code_hash, attempts, expires_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       new_email = excluded.new_email,
       code_hash = excluded.code_hash,
       attempts = 0,
       expires_at = excluded.expires_at,
       created_at = excluded.created_at`
  ).run(params.userId, params.newEmail, params.codeHash, expiresAt, now);

  return {
    newEmail: params.newEmail,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function getPendingEmailChange(userId: string): {
  user_id: string;
  new_email: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
} | null {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT user_id, new_email, code_hash, attempts, expires_at
       FROM email_change_requests
       WHERE user_id = ?`
    )
    .get(userId) as
    | {
        user_id: string;
        new_email: string;
        code_hash: string;
        attempts: number;
        expires_at: number;
      }
    | undefined;

  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM email_change_requests WHERE user_id = ?').run(userId);
    return null;
  }
  return row;
}

export function recordFailedEmailChangeAttempt(userId: string, maxAttempts = 5): { lockedOut: boolean } {
  const tx = db.transaction(() => {
    db.prepare('UPDATE email_change_requests SET attempts = attempts + 1 WHERE user_id = ?').run(
      userId
    );
    const row = db
      .prepare('SELECT attempts FROM email_change_requests WHERE user_id = ?')
      .get(userId) as { attempts: number } | undefined;
    if (!row || row.attempts >= maxAttempts) {
      db.prepare('DELETE FROM email_change_requests WHERE user_id = ?').run(userId);
      return { lockedOut: true };
    }
    return { lockedOut: false };
  });
  return tx();
}

export function completeEmailChange(
  userId: string,
  newEmail: string
): 'updated' | 'conflict' | 'not_found' {
  const tx = db.transaction(() => {
    const existingOwner = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?')
      .get(newEmail, userId) as { id: string } | undefined;
    if (existingOwner) {
      return 'conflict' as const;
    }

    const info = db
      .prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?')
      .run(newEmail, userId);
    db.prepare('DELETE FROM email_change_requests WHERE user_id = ?').run(userId);
    return info.changes > 0 ? ('updated' as const) : ('not_found' as const);
  });
  return tx();
}

export function cancelEmailChangeRequest(userId: string): boolean {
  const info = db.prepare('DELETE FROM email_change_requests WHERE user_id = ?').run(userId);
  return info.changes > 0;
}

export function createEmailVerificationToken(params: {
  id: string;
  userId: string;
  tokenHash: string;
  ttlMs: number;
}): void {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL'
    ).run(now, params.userId);
    db.prepare(
      `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    ).run(params.id, params.userId, params.tokenHash, now + params.ttlMs, now);
  });
  tx();
}

export function consumeEmailVerificationToken(tokenHash: string): string | null {
  const now = Date.now();
  const tx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT id, user_id
         FROM email_verification_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
      )
      .get(tokenHash, now) as { id: string; user_id: string } | undefined;
    if (!row) return null;

    db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE id = ?').run(now, row.id);
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
    return row.user_id;
  });
  return tx();
}

export function deleteUserAccountCascade(userId: string): {
  deleted: boolean;
  avatarUrl: string | null;
  postImageUrls: string[];
} {
  const tx = db.transaction(() => {
    const user = findUserById(userId);
    if (!user) {
      return { deleted: false, avatarUrl: null, postImageUrls: [] };
    }

    const postImageRows = db
      .prepare(
        `SELECT pi.image_url
         FROM post_images pi
         INNER JOIN posts p ON p.id = pi.post_id
         WHERE p.author_id = ?`
      )
      .all(userId) as Array<{ image_url: string }>;

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return {
      deleted: true,
      avatarUrl: user.avatar_url ?? null,
      postImageUrls: postImageRows.map((row) => row.image_url),
    };
  });

  return tx();
}

export function logSecurityEvent(params: {
  eventType: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  try {
    db.prepare(
      `INSERT INTO security_logs (
         id, event_type, user_id, ip_address, user_agent, metadata_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.eventType.slice(0, 64),
      params.userId ?? null,
      params.ipAddress ? params.ipAddress.slice(0, 64) : null,
      params.userAgent ? params.userAgent.slice(0, 220) : null,
      params.metadata ? JSON.stringify(params.metadata).slice(0, 1000) : null,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Failed to record security log:', err instanceof Error ? err.message : 'Unknown error');
  }
}

export function getUserSecurityLogs(userId: string, limit = 25): SecurityLogView[] {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = db
    .prepare(
      `SELECT id, event_type, ip_address, user_agent, metadata_json, created_at
       FROM security_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, safeLimit) as Array<{
    id: string;
    event_type: string;
    ip_address: string | null;
    user_agent: string | null;
    metadata_json: string | null;
    created_at: string;
  }>;

  return rows.map((row) => {
    let parsedMetadata: Record<string, unknown> = {};
    if (row.metadata_json) {
      try {
        parsedMetadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
      } catch {
        parsedMetadata = {};
      }
    }
    return {
      id: row.id,
      eventType: row.event_type,
      ipAddress: row.ip_address || 'Unknown',
      userAgent: row.user_agent || 'Unknown device',
      metadata: parsedMetadata,
      createdAt: row.created_at,
    };
  });
}

export function createReport(params: {
  id: string;
  reporterUserId: string;
  targetType: 'post' | 'user';
  targetId: string;
  reason: string;
  details: string;
  createdAt: string;
}): ReportView {
  db.prepare(
    `INSERT INTO reports (
       id, reporter_user_id, target_type, target_id, reason, details, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'Open', ?)`
  ).run(
    params.id,
    params.reporterUserId,
    params.targetType,
    params.targetId,
    params.reason,
    params.details || null,
    params.createdAt
  );

  return {
    id: params.id,
    targetType: params.targetType,
    targetId: params.targetId,
    reason: params.reason,
    status: 'Open',
    createdAt: params.createdAt,
  };
}

export function hasRecentDuplicateReport(
  reporterUserId: string,
  targetType: 'post' | 'user',
  targetId: string
): boolean {
  const row = db
    .prepare(
      `SELECT id FROM reports
       WHERE reporter_user_id = ? AND target_type = ? AND target_id = ? AND status = 'Open'
       LIMIT 1`
    )
    .get(reporterUserId, targetType, targetId) as { id: string } | undefined;
  return Boolean(row);
}

export function pruneExpiredSecurityRecords(): void {
  const now = Date.now();
  db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(now - 60_000);
  db.prepare('DELETE FROM email_change_requests WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ?').run(now - 24 * 60 * 60_000);
  db.prepare('DELETE FROM user_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(
    now - 7 * 24 * 60 * 60_000,
    now - 7 * 24 * 60 * 60_000
  );
}


