// supabase/functions/backfill_fb_insights/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Config ---- //
const GRAPH_BASE = "https://graph.facebook.com/v20.0";
const DEFAULT_DAYS = 90;

// Metrics to pull from FB Insights (must be valid for /{post-id}/insights)
const FB_METRICS = [
  "post_impressions",
  "post_reactions_by_type_total",
] as const;

type FbMetricName = (typeof FB_METRICS)[number];

type AnalyticsMetric = "impressions" | "likes" | "comments" | "shares";

const METRIC_MAP: Record<FbMetricName, AnalyticsMetric | null> = {
  post_impressions: "impressions",
  post_reactions_by_type_total: "likes", // we sum reactions
};

// ---- Types ---- //

type ConnectedMetaRow = {
  id: string;
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  access_token: string | null;
};

type FbAttachment = {
  media_type?: string; // "photo", "video", "share", "link", etc.
  type?: string;       // sometimes present (e.g. "photo", "video_inline")
};

type FbPost = {
  id: string;
  created_time: string;
  message?: string;
  status_type?: string | null;
  attachments?: {
    data?: FbAttachment[];
  };
};

type FbPostsResponse = {
  data: FbPost[];
  paging?: { next?: string };
};

type FbInsightsResponse = {
  data: {
    name: FbMetricName;
    period: string;
    values: { value: number | Record<string, number>; end_time?: string }[];
  }[];
};

type FbEngagementFields = {
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
};

type AnalyticsEventInsert = {
  user_id: string;
  platform: "facebook";
  object_id: string;
  metric: AnalyticsMetric;
  value: number;
  ts: string; // ISO timestamptz
};

type ExternalPostInsert = {
  user_id: string;
  platform: "facebook";
  object_id: string; // FB post ID
  page_id: string;
  caption: string | null;
  content_type: string | null; // raw FB-ish type → normalized in DB by trigger
  created_at: string;
};

// ---- Helpers ---- //

function getSupabaseClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  return createClient(url, serviceKey, {
    global: {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
      },
    },
  });
}

function daysAgoToUnix(days: number): number {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

// Infer a usable content_type string from FB post fields
function inferContentTypeFromPost(post: FbPost): string | null {
  const firstAttachment = post.attachments?.data?.[0];

  const mediaType = firstAttachment?.media_type?.toLowerCase();
  const type = firstAttachment?.type?.toLowerCase();
  const statusType = post.status_type?.toLowerCase();

  // Prefer explicit media_type
  if (mediaType) {
    if (mediaType.includes("photo") || mediaType === "image") return "photo";
    if (mediaType.includes("video")) return "video";
    if (mediaType.includes("share") || mediaType.includes("link")) return "link";
    if (mediaType.includes("album") || mediaType.includes("carousel")) {
      return "carousel";
    }
  }

  // Fallback to attachment.type
  if (type) {
    if (type.includes("photo") || type === "image") return "photo";
    if (type.includes("video")) return "video";
    if (type.includes("share") || type.includes("link")) return "link";
    if (type.includes("album") || type.includes("carousel")) return "carousel";
  }

  // Fallback to status_type
  if (statusType) {
    if (statusType.includes("shared_story")) return "share";
    if (statusType.includes("added_photos")) return "photo";
    if (statusType.includes("added_video")) return "video";
  }

  // Last resort: if there's a message only, treat as "status"
  if (post.message && !firstAttachment) {
    return "status";
  }

  return null;
}

// Fetch connected FB accounts (optionally for one user)
async function fetchConnectedFacebookAccounts(
  supabase: ReturnType<typeof createClient>,
  userId?: string,
): Promise<ConnectedMetaRow[]> {
  let query = supabase
    .from("connected_meta_accounts")
    .select("id, user_id, platform, page_id, access_token")
    .eq("platform", "facebook");

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as ConnectedMetaRow[];
}

// Fetch posts for a Page with caption + basic attachment metadata
async function fetchPagePosts(
  pageId: string,
  accessToken: string,
  sinceUnix: number,
): Promise<FbPost[]> {
  const allPosts: FbPost[] = [];

  // We include attachments + status_type so we can infer content_type
  const fields = [
    "id",
    "created_time",
    "message",
    "status_type",
    "attachments{media_type,type}",
  ].join(",");

  let url =
    `${GRAPH_BASE}/${pageId}/posts` +
    `?fields=${encodeURIComponent(fields)}` +
    `&limit=50&since=${sinceUnix}` +
    `&access_token=${accessToken}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Error fetching posts:", await res.text());
      break;
    }

    const json = (await res.json()) as FbPostsResponse;
    allPosts.push(...(json.data || []));

    if (json.paging?.next) {
      url = json.paging.next;
    } else {
      url = "";
    }
  }

  return allPosts;
}

// Fetch insights for a single post (impressions, reactions)
async function fetchPostInsights(
  postId: string,
  accessToken: string,
): Promise<FbInsightsResponse["data"]> {
  const metricsParam = FB_METRICS.join(",");
  const url =
    `${GRAPH_BASE}/${postId}/insights` +
    `?metric=${metricsParam}&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Error fetching insights for post ${postId}:`, await res.text());
    return [];
  }

  const json = (await res.json()) as FbInsightsResponse;
  return json.data || [];
}

// Fetch comments & shares (not via insights)
async function fetchPostCommentShareCounts(
  postId: string,
  accessToken: string,
): Promise<{ commentCount: number; shareCount: number }> {
  const url =
    `${GRAPH_BASE}/${postId}` +
    `?fields=comments.summary(true).limit(0),shares` +
    `&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(
      `Error fetching comment/share counts for post ${postId}:`,
      await res.text(),
    );
    return { commentCount: 0, shareCount: 0 };
  }

  const json = (await res.json()) as FbEngagementFields;

  const commentCount = json.comments?.summary?.total_count ?? 0;
  const shareCount = json.shares?.count ?? 0;

  return { commentCount, shareCount };
}

// Convert FB insights (+ extra counts) to analytics_events rows
function buildAnalyticsEvents(
  args: {
    userId: string;
    postId: string;
    createdTime: string;
  },
  insights: FbInsightsResponse["data"],
  extra?: { commentCount?: number; shareCount?: number },
): AnalyticsEventInsert[] {
  const rows: AnalyticsEventInsert[] = [];

  const base: Pick<
    AnalyticsEventInsert,
    "user_id" | "platform" | "object_id" | "ts"
  > = {
    user_id: args.userId,
    platform: "facebook",
    object_id: args.postId,
    ts: args.createdTime, // you could use last value's end_time instead, if you want
  };

  // From insights → impressions & likes
  for (const metric of insights) {
    const mapped = METRIC_MAP[metric.name as FbMetricName];
    if (!mapped) continue;

    const last = metric.values[metric.values.length - 1];
    if (!last || last.value == null) continue;

    let valueNumber: number;

    if (typeof last.value === "number") {
      valueNumber = last.value;
    } else {
      // reactions_by_type: sum all reaction counts
      valueNumber = Object.values(last.value).reduce(
        (sum, v) => sum + (typeof v === "number" ? v : 0),
        0,
      );
    }

    if (!Number.isFinite(valueNumber)) continue;

    rows.push({
      ...base,
      metric: mapped,
      value: valueNumber,
    });
  }

  // From extra → comments & shares
  if (extra) {
    if (extra.commentCount != null) {
      rows.push({
        ...base,
        metric: "comments",
        value: extra.commentCount,
      });
    }
    if (extra.shareCount != null) {
      rows.push({
        ...base,
        metric: "shares",
        value: extra.shareCount,
      });
    }
  }

  return rows;
}

// Upsert analytics_events
async function insertAnalyticsEvents(
  supabase: ReturnType<typeof createClient>,
  rows: AnalyticsEventInsert[],
) {
  if (!rows.length) return { inserted: 0 };

  const { error, count } = await supabase
    .from("analytics_events")
    .upsert(rows, {
      onConflict: "user_id,platform,object_id,metric,ts",
      ignoreDuplicates: true,
    })
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("Error inserting analytics_events:", error);
    throw error;
  }

  return { inserted: count ?? 0 };
}

// Upsert external_posts (caption/content_type/etc.)
async function insertExternalPosts(
  supabase: ReturnType<typeof createClient>,
  rows: ExternalPostInsert[],
) {
  if (!rows.length) return { inserted: 0 };

  const { error, count } = await supabase
    .from("external_posts")
    .upsert(rows, {
      onConflict: "user_id,platform,object_id",
    })
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("Error inserting external_posts:", error);
    throw error;
  }

  return { inserted: count ?? 0 };
}

// ---- Main handler ---- //

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Use POST", { status: 405 });
  }

  try {
    const supabase = getSupabaseClient(req);

    const body = (await req.json().catch(() => ({}))) as {
      days?: number;
      userId?: string;
    };

    const days = body.days && body.days > 0 ? body.days : DEFAULT_DAYS;
    const sinceUnix = daysAgoToUnix(days);

    const accounts = await fetchConnectedFacebookAccounts(supabase, body.userId);

    let totalPosts = 0;
    let totalEvents = 0;
    let totalExternal = 0;

    for (const account of accounts) {
      if (!account.page_id || !account.access_token) {
        console.warn(
          "Skipping account without page_id/access_token:",
          account.id,
        );
        continue;
      }

      console.log(
        `Backfilling FB insights for user ${account.user_id}, page ${account.page_id} (last ${days} days)`,
      );

      const posts = await fetchPagePosts(
        account.page_id,
        account.access_token,
        sinceUnix,
      );

      console.log(`Found ${posts.length} posts for page ${account.page_id}`);
      totalPosts += posts.length;

      // 1) Upsert external_posts for all posts
      const externalRows: ExternalPostInsert[] = posts.map((p) => {
        const contentType = inferContentTypeFromPost(p);

        return {
          user_id: account.user_id,
          platform: "facebook",
          object_id: p.id,
          page_id: account.page_id!,
          caption: p.message ?? null,
          content_type: contentType, // DB trigger will map this → post_type_enum
          created_at: p.created_time,
        };
      });

      if (externalRows.length) {
        const { inserted } = await insertExternalPosts(supabase, externalRows);
        totalExternal += inserted;
        console.log(
          `Upserted ${inserted} external_posts rows for user ${account.user_id} (${account.page_id})`,
        );
      }

      // 2) Fetch insights + comments/shares in small batches
      const BATCH_SIZE = 10;

      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);

        const allEventRows: AnalyticsEventInsert[] = [];

        for (const post of batch) {
          const [insights, counts] = await Promise.all([
            fetchPostInsights(post.id, account.access_token),
            fetchPostCommentShareCounts(post.id, account.access_token),
          ]);

          const rows = buildAnalyticsEvents(
            {
              userId: account.user_id,
              postId: post.id,
              createdTime: post.created_time,
            },
            insights,
            {
              commentCount: counts.commentCount,
              shareCount: counts.shareCount,
            },
          );
          allEventRows.push(...rows);
        }

        if (allEventRows.length) {
          const { inserted } = await insertAnalyticsEvents(
            supabase,
            allEventRows,
          );
          totalEvents += inserted;

          console.log(
            `Inserted ${inserted} analytics_events rows for user ${account.user_id} (page ${account.page_id})`,
          );
        }
      }
    }

    return new Response(
      JSON.stringify(
        {
          ok: true,
          days,
          accountsProcessed: accounts.length,
          totalPostsDiscovered: totalPosts,
          totalExternalPostsUpserted: totalExternal,
          totalAnalyticsEventsInserted: totalEvents,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Unexpected error in backfill_fb_insights:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
