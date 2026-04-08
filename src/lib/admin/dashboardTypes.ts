export type Bucket = "day" | "week" | "month";

export type KpisPayload = {
  pageviews: number;
  visits: number;
  signedInVisits: number;
  guestVisits: number;
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

export type AudiencePoint = {
  bucketStart: string;
  signedInVisits: number;
  guestVisits: number;
  signedInUsers: number;
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
  audience: AudiencePoint[];
  signups: SignupsPoint[];
  posts: PostsPoint[];
  purges: PurgesPoint[];
};

export type DashboardPayload = {
  kpis: KpisPayload;
  series: DashboardSeries;
};
