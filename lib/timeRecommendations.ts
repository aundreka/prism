// lib/timeRecommendations.ts
import { supabase } from "@/lib/supabase";

export type TimeSegmentRecommendation = {
  platform: "facebook";
  timeslot: string;          // timestamptz ISO
  dow: number;               // 0–6 (Sunday=0 in Postgres)
  hour: number;              // 0–23
  segment_id: number | null;
  predicted_avg: number | null;
  bandit_alpha: number | null;
  bandit_beta: number | null;
  hybridSample: number;      // final mixed (model + bandit) score, 0–1
  sample_count?: number | null; // optional, if your RPC returns it
};

type BanditInputRow = {
  platform: string;
  timeslot: string;
  dow: number;
  hour: number;
  segment_id: number | null;
  predicted_avg: number | null;
  bandit_alpha: number | null;
  bandit_beta: number | null;
  sample_count?: number | null;
};

export async function getTimeSegmentRecommendations(
  platform: "facebook",
  opts: { horizonDays: number; weightModel: number; weightBandit: number }
): Promise<TimeSegmentRecommendation[]> {
  const { horizonDays, weightModel, weightBandit } = opts;

  const { data, error } = await supabase.rpc(
    "get_time_segment_bandit_inputs",
    {
      p_platform: platform,
      p_horizon_days: horizonDays,
    }
  );

  console.log("[timeRecs] RPC error:", error);
  console.log(
    "[timeRecs] RPC raw data length:",
    data ? (data as any[]).length : 0
  );
  console.log(
    "[timeRecs] First few rows:",
    ((data as any[]) || []).slice(0, 3)
  );

  if (error) {
    throw error;
  }

  const rows: BanditInputRow[] = (data || []) as any[];

  if (!rows.length) {
    console.log("[timeRecs] No rows from get_time_segment_bandit_inputs");
    return [];
  }

  function sampleBeta(alpha: number | null, beta: number | null): number {
    const a = Math.max(alpha ?? 1, 1e-3);
    const b = Math.max(beta ?? 1, 1e-3);

    // simple Beta(α,β) sampler via two Gamma(α,1), Gamma(β,1) approximations
    const u1 = Math.random();
    const u2 = Math.random();
    const x = Math.pow(u1, 1 / a);
    const y = Math.pow(u2, 1 / b);
    return x / (x + y);
  }

  const recs: TimeSegmentRecommendation[] = rows.map((r) => {
    const modelScore = r.predicted_avg ?? 0;
    const theta = sampleBeta(r.bandit_alpha, r.bandit_beta);

    const hybridSample = weightModel * modelScore + weightBandit * theta;

    return {
      platform: "facebook",
      timeslot: r.timeslot,
      dow: r.dow,
      hour: r.hour,
      segment_id: r.segment_id,
      predicted_avg: r.predicted_avg,
      bandit_alpha: r.bandit_alpha,
      bandit_beta: r.bandit_beta,
      hybridSample,
      sample_count: r.sample_count ?? null,
    };
  });

  console.log("[timeRecs] Final rec count:", recs.length);
  return recs.sort((a, b) => b.hybridSample - a.hybridSample);
}
