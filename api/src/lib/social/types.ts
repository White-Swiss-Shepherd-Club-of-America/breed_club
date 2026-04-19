import type { PublicLitterAd } from "@breed-club/shared";

export interface SocialPostResult {
  platform: string;
  external_post_id: string | null;
  status: "posted" | "failed";
  error_message: string | null;
  posted_at: string | null;
}

/**
 * Contract every social platform adapter must implement.
 *
 * Each adapter is responsible for reading its own credentials from `env`
 * and for building a platform-appropriate message from the ad.
 */
export interface SocialPlatformAdapter {
  readonly name: string;
  /** Return false if required secrets are missing from env. */
  isConfigured(env: Record<string, string | undefined>): boolean;
  /** Post the ad and return a result (never throws — errors are captured). */
  post(ad: PublicLitterAd, env: Record<string, string | undefined>): Promise<SocialPostResult>;
}
