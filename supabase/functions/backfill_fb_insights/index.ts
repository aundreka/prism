// supabase/functions/backfill_fb_insights/index.ts

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- Config ---- //
const GRAPH_BASE = "https://graph.facebook.com/v20.0";
const DEFAULT_DAYS = 90;

// We ONLY use reactions here. Impressions / engaged_users are deprecated / flaky.
// We'll derive engagement + synthetic "impressions" ourselves.
const FB_METRICS = ["post_reactions_by_type_total"] as const;

type FbMetricName = (typeof FB_METRICS)[number];

type AnalyticsMetric =
  | "impressions"
  | "likes"
  | "comments"
  | "shares"
  | "engagement";

const METRIC_MAP: Record<FbMetricName, AnalyticsMetric | null> = {
  post_reactions_by_type_total: "likes",
};

// ---- Types ---- //

type ConnectedMetaRow = {
  id: string;
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  access_token: string | null;
  is_active?: boolean | null;
};

type FbAttachment = {
  media_type?: string;
  type?: string;
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

// 🔧 add page_id here
type AnalyticsEventInsert = {
  user_id: string;
  platform: "facebook";
  page_id: string | null;
  object_id: string;
  metric: AnalyticsMetric;
  value: number;
  ts: string;
};

type ExternalPostInsert = {
  user_id: string;
  platform: "facebook";
  object_id: string;
  page_id: string;
  caption: string | null;
  content_type: string | null;
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

function inferContentTypeFromPost(post: FbPost): string | null {
  const firstAttachment = post.attachments?.data?.[0];

  const mediaType = firstAttachment?.media_type?.toLowerCase();
  const type = firstAttachment?.type?.toLowerCase();
  const statusType = post.status_type?.toLowerCase();

  if (mediaType) {
    if (mediaType.includes("photo") || mediaType === "image") return "photo";
    if (mediaType.includes("video")) return "video";
    if (mediaType.includes("share") || mediaType.includes("link")) return "link";
    if (mediaType.includes("album") || mediaType.includes("carousel")) {
      return "carousel";
    }
  }

  if (type) {
    if (type.includes("photo") || type === "image") return "photo";
    if (type.includes("video")) return "video";
    if (type.includes("share") || type.includes("link")) return "link";
    if (type.includes("album") || type.includes("carousel")) return "carousel";
  }

  if (statusType) {
    if (statusType.includes("shared_story")) return "share";
    if (statusType.includes("added_photos")) return "photo";
    if (statusType.includes("added_video")) return "video";
  }

  if (post.message && !firstAttachment) {
    return "status";
  }

  return null;
}

async function fetchConnectedFacebookAccounts(
  supabase: ReturnType<typeof createClient>,
  userId?: string,
  pageId?: string,
): Promise<ConnectedMetaRow[]> {
  let query = supabase
    .from("connected_meta_accounts")
    .select("id, user_id, platform, page_id, access_token, is_active")
    .eq("platform", "facebook");

  if (userId) query = query.eq("user_id", userId);
  if (pageId) {
    query = query.eq("page_id", pageId);
  } else {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as ConnectedMetaRow[];
}

async function fetchPagePosts(
  pageId: string,
  accessToken: string,
  sinceUnix: number,
): Promise<FbPost[]> {
  const allPosts: FbPost[] = [];

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
    `&access_token=${encodeURIComponent(accessToken)}`;

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

// Only likes via insights; comments/shares via edge fields
async function fetchPostInsights(
  postId: string,
  accessToken: string,
): Promise<FbInsightsResponse["data"]> {
  const allData: FbInsightsResponse["data"] = [];

  for (const metric of FB_METRICS) {
    const url =
      `${GRAPH_BASE}/${postId}/insights` +
      `?metric=${encodeURIComponent(metric)}` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    const res = await fetch(url);
    const txt = await res.text();

    if (!res.ok) {
      let json: any;
      try {
        json = JSON.parse(txt);
      } catch {
        console.error(
          `Error fetching insights for post ${postId} metric ${metric}:`,
          txt,
        );
        continue;
      }

      const err = json?.error;
      if (
        err?.code === 100 &&
        typeof err?.message === "string" &&
        err.message.includes("valid insights metric")
      ) {
        console.warn(
          `Metric "${metric}" invalid for post ${postId}. Skipping this metric. Details:`,
          err.message,
        );
        continue;
      }

      console.error(
        `Error fetching insights for post ${postId} metric ${metric}:`,
        json,
      );
      continue;
    }

    let json: FbInsightsResponse;
    try {
      json = JSON.parse(txt);
    } catch {
      console.error(
        `Insights parse error for post ${postId} metric ${metric}:`,
        txt,
      );
      continue;
    }

    if (Array.isArray(json.data) && json.data.length > 0) {
      allData.push(...json.data);
    }
  }

  return allData;
}

async function fetchPostCommentShareCounts(
  postId: string,
  accessToken: string,
): Promise<{ commentCount: number; shareCount: number }> {
  const url =
    `${GRAPH_BASE}/${postId}` +
    `?fields=comments.summary(true).limit(0),shares` +
    `&access_token=${encodeURIComponent(accessToken)}`;

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

// Build analytics rows, and ALSO synthesize engagement + impressions
function buildAnalyticsEvents(
  args: {
    userId: string;
    pageId: string | null;  // 🔧 include pageId in args
    postId: string;
    createdTime: string;
  },
  insights: FbInsightsResponse["data"],
  extra?: { commentCount?: number; shareCount?: number },
): AnalyticsEventInsert[] {
  const rows: AnalyticsEventInsert[] = [];

  const base: Pick<
    AnalyticsEventInsert,
    "user_id" | "platform" | "page_id" | "object_id" | "ts"
  > = {
    user_id: args.userId,
    platform: "facebook",
    page_id: args.pageId,       // 🔧 set page_id
    object_id: args.postId,
    ts: args.createdTime,
  };

  let likes = 0;
  let comments = 0;
  let shares = 0;

  // From insights → likes
  for (const metric of insights) {
    const mapped = METRIC_MAP[metric.name as FbMetricName];
    if (!mapped) continue;

    const last = metric.values[metric.values.length - 1];
    if (!last || last.value == null) continue;

    let valueNumber: number;

    if (typeof last.value === "number") {
      valueNumber = last.value;
    } else {
      valueNumber = Object.values(last.value).reduce(
        (sum, v) => sum + (typeof v === "number" ? v : 0),
        0,
      );
    }

    if (!Number.isFinite(valueNumber)) continue;

    if (mapped === "likes") likes += valueNumber;

    rows.push({
      ...base,
      metric: mapped,
      value: valueNumber,
    });
  }

  // From extra → comments & shares
  if (extra) {
    if (extra.commentCount != null) {
      comments += extra.commentCount;
      rows.push({
        ...base,
        metric: "comments",
        value: extra.commentCount,
      });
    }
    if (extra.shareCount != null) {
      shares += extra.shareCount;
      rows.push({
        ...base,
        metric: "shares",
        value: extra.shareCount,
      });
    }
  }

  // Synthetic engagement & impressions = likes + comments + shares
  const engagement = likes + comments + shares;

  if (engagement > 0) {
    rows.push({
      ...base,
      metric: "engagement",
      value: engagement,
    });
    rows.push({
      ...base,
      metric: "impressions",
      value: engagement,
    });
  }

  return rows;
}

async function insertAnalyticsEvents(
  supabase: ReturnType<typeof createClient>,
  rows: AnalyticsEventInsert[],
) {
  if (!rows.length) return { inserted: 0 };

  const { error } = await supabase
    .from("analytics_events")
    .upsert(rows, {
      onConflict: "user_id,platform,object_id,metric,ts",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error("Error inserting analytics_events:", error);
    throw error;
  }

  return { inserted: rows.length };
}

async function insertExternalPosts(
  supabase: ReturnType<typeof createClient>,
  rows: ExternalPostInsert[],
) {
  if (!rows.length) return { inserted: 0 };

  const { error } = await supabase
    .from("external_posts")
    .upsert(rows, {
      onConflict: "user_id,platform,object_id",
    });

  if (error) {
    console.error("Error inserting external_posts:", error);
    throw error;
  }

  return { inserted: rows.length };
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
      pageId?: string;
    };

    const days = body.days && body.days > 0 ? body.days : DEFAULT_DAYS;
    const sinceUnix = daysAgoToUnix(days);

    const accounts = await fetchConnectedFacebookAccounts(
      supabase,
      body.userId,
      body.pageId,
    );

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

      const externalRows: ExternalPostInsert[] = posts.map((p) => {
        const contentType = inferContentTypeFromPost(p);

        return {
          user_id: account.user_id,
          platform: "facebook",
          object_id: p.id,
          page_id: account.page_id!,
          caption: p.message ?? null,
          content_type: contentType,
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
              pageId: account.page_id,          // 🔧 pass pageId through
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
        } else {
          console.log(
            `Inserted 0 analytics_events rows for user ${account.user_id} (page ${account.page_id})`,
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
