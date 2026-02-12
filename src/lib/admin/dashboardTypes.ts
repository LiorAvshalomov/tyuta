export type Bucket = "day" | "week" | "month";

export type KpisPayload = {
  pageviews: number;
  visits: number;
  bounceRate: number; // percent 0-100
  avgSessionMinutes: number;
  uniqueUsers: number;
  signups: number;
  postsCreated: number;
  postsPublished: number;
  postsSoftDeleted: number;
  postsPurged: number;
  usersSuspended: number;
  usersBanned: number;
  usersPurged: number;
};

export type TrafficPoint = {
  bucketStart: string;
  pageviews: number;
  visits: number;
  uniqueUsers: number;
};

export type ActiveUsersPoint = {
  bucketStart: string;
  activeUsers: number;
};

export type SignupsPoint = {
  bucketStart: string;
  signups: number;
};

export type PostsPoint = {
  bucketStart: string;
  postsCreated: number;
  postsPublished: number;
  postsSoftDeleted: number;
};

export type PurgesPoint = {
  bucketStart: string;
  postsPurged: number;
  usersPurged: number;
};

export type DashboardSeries = {
  traffic: TrafficPoint[];
  activeUsers: ActiveUsersPoint[];
  signups: SignupsPoint[];
  posts: PostsPoint[];
  purges: PurgesPoint[];
};

export type DashboardPayload = {
  kpis: KpisPayload;
  series: DashboardSeries;
};
