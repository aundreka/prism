// lib/timeRecommendations.ts
import { supabase } from "@/lib/supabase";
import { sampleBeta } from "./bandit";

export type PlatformEnum = "facebook" | "instagram";

export type TimeSegmentBanditRow = {
  platform: PlatformEnum;
  timeslot: string;      // timestamptz → ISO string
  dow: number;
  hour: number;
  segment_id: number | null;
  predicted_avg: number | null;
  bandit_alpha: number | null;
  bandit_beta: number | null;
};

export type TimeSegmentRecommendation = TimeSegmentBanditRow & {
  theta: number;         // sampled bandit value
  hybridSample: number;  // blended score used for ranking
};

type GetRecommendationsOptions = {
  horizonDays?: number;  // default 7
  weightModel?: number;  // default 0.7
  weightBandit?: number; // default 0.3
};

// If you want, you can mirror the generated error shape:
type RpcShape =
  | TimeSegmentBanditRow[]
  | { Error: "Type mismatch: Cannot cast single object to array type. Remove Array wrapper from return type or make sure you are not using .single() up in the calling chain"; };

function isRowArray(data: RpcShape | null): data is TimeSegmentBanditRow[] {
  return Array.isArray(data);
}

export async function getTimeSegmentRecommendations(
  platform: PlatformEnum,
  options: GetRecommendationsOptions = {}
): Promise<TimeSegmentRecommendation[]> {
  const {
    horizonDays = 7,
    weightModel = 0.7,
    weightBandit = 0.3,
  } = options;

  const { data, error } = await supabase.rpc("get_time_segment_bandit_inputs", {
    p_platform: platform,
    p_horizon_days: horizonDays,
  });

  if (error) {
    console.error("get_time_segment_bandit_inputs error:", error);
    throw error;
  }

  if (!data) return [];

  // Runtime safety + TS narrowing for the weird union type
  if (!isRowArray(data)) {
    console.warn("Unexpected RPC shape for get_time_segment_bandit_inputs:", data);
    return [];
  }

  const rows: TimeSegmentBanditRow[] = data;

  if (rows.length === 0) return [];

  const scored: TimeSegmentRecommendation[] = rows.map((row) => {
    const predicted = row.predicted_avg ?? 0;

    // Numeric from Postgres can sometimes come back as string → coerce
    const alpha = row.bandit_alpha != null ? Number(row.bandit_alpha) : 1;
    const beta  = row.bandit_beta  != null ? Number(row.bandit_beta)  : 1;

    let theta: number;
    try {
      theta = sampleBeta(alpha, beta);
    } catch {
      theta = alpha > 0 && beta > 0 ? alpha / (alpha + beta) : 0.5;
    }

    const hybridSample = weightModel * predicted + weightBandit * theta;

    return {
      ...row,
      theta,
      hybridSample,
    };
  });

  scored.sort((a, b) => b.hybridSample - a.hybridSample);

  return scored;
}
