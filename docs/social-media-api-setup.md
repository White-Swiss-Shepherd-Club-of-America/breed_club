# Social Media API Setup Guide

This document covers how to obtain API credentials for Facebook/Instagram and X (Twitter) to enable content posting from breed_club.

---

## Facebook & Instagram

Facebook and Instagram share the same developer platform (Meta for Developers). You need a Facebook Page (for FB posting) and an Instagram Business or Creator account connected to that Page (for IG posting).

### Prerequisites

- A Facebook account with admin access to a Facebook Page
- An Instagram Business or Creator account linked to that Facebook Page
- A verified business or organization (Meta may require this for production access)

### Step 1 — Create a Meta App

1. Go to [https://developers.facebook.com](https://developers.facebook.com) and log in.
2. Click **My Apps** → **Create App**.
3. Select **Business** as the app type.
4. Fill in the app name (e.g., "Breed Club"), contact email, and optionally link to a Business Portfolio.
5. Click **Create App**.

### Step 2 — Add Required Products

In the app dashboard, add these products:

- **Facebook Login** — needed to get user tokens with page permissions
- **Instagram Graph API** — needed for Instagram posting
- **Pages API** — needed for Facebook Page posting

### Step 3 — Request Permissions

You need specific permissions. Under **App Review** → **Permissions and Features**, request:

| Permission | Purpose |
|---|---|
| `pages_manage_posts` | Create/publish posts on a Facebook Page |
| `pages_read_engagement` | Read page metadata |
| `instagram_basic` | Access Instagram account info |
| `instagram_content_publish` | Publish photos/videos/reels to Instagram |
| `instagram_manage_comments` | Optional: manage comments |

> **Note:** `instagram_content_publish` requires submitting for App Review with a screencast showing how your app uses it. Meta reviews these manually and it can take 1–5 business days.

### Step 4 — Generate a Page Access Token

1. In the Graph API Explorer ([https://developers.facebook.com/tools/explorer/](https://developers.facebook.com/tools/explorer/)), select your app.
2. Click **Generate Access Token** and grant the permissions above.
3. Use the short-lived User Token to call `GET /me/accounts` — this returns Page Access Tokens for each page you manage.
4. To get a **long-lived Page Access Token** (never expires):
   - Exchange the short-lived user token for a long-lived user token via `GET /oauth/access_token?grant_type=fb_exchange_token&...`
   - Then call `GET /{page-id}?fields=access_token` with the long-lived user token

### Step 5 — Get the Instagram Business Account ID

Call the Graph API:

```
GET /{page-id}?fields=instagram_business_account&access_token={page-access-token}
```

Save the returned `instagram_business_account.id` — this is the IG account ID used for posting.

### Credentials to Store

| Key | Description |
|---|---|
| `META_APP_ID` | Your app's App ID (from app dashboard) |
| `META_APP_SECRET` | Your app's App Secret |
| `META_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token |
| `META_PAGE_ID` | Facebook Page ID |
| `META_IG_ACCOUNT_ID` | Instagram Business Account ID |

### Posting Flow (Instagram)

1. Create a media container: `POST /{ig-account-id}/media` with `image_url` and `caption`
2. Publish it: `POST /{ig-account-id}/media_publish` with the `creation_id` from step 1

### Posting Flow (Facebook)

```
POST /{page-id}/feed
  { "message": "...", "link": "...", "access_token": "..." }
```

### Useful Links

- [Meta App Dashboard](https://developers.facebook.com/apps)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Instagram Content Publishing docs](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Page Access Token docs](https://developers.facebook.com/docs/pages/access-tokens)

---

## X (Twitter)

### Prerequisites

- An X account that will own the developer app
- A verified phone number on that account
- For posting on behalf of an organization: the account should be the club's official X account (or you can use OAuth to post on behalf of members)

### Step 1 — Apply for a Developer Account

1. Go to [https://developer.x.com](https://developer.x.com) and sign in.
2. Click **Sign up** under Developer Portal.
3. Select your use case (choose **Making a bot** or **Building a product**).
4. Describe how you'll use the API — be specific: "Automated posting of health clearance announcements and club news to the club's X account."
5. Submit. Approval is usually instant for Basic tier; elevated tiers may take longer.

### Step 2 — Create a Project and App

1. In the Developer Portal, go to **Projects & Apps** → **+ New Project**.
2. Name it (e.g., "Breed Club"), select **Production** environment.
3. Create an app within the project.
4. Note your **API Key** (Consumer Key) and **API Key Secret** (Consumer Secret) — shown only once.

### Step 3 — Set App Permissions

1. In your app settings, go to **User authentication settings**.
2. Enable **OAuth 1.0a** (required for posting as a user/account).
3. Set **App permissions** to **Read and Write**.
4. Set **Type of App** to **Web App, Automated App or Bot**.
5. Enter a **Callback URI** (can be `http://localhost` if not doing OAuth flows) and a **Website URL**.

### Step 4 — Generate Access Tokens

For posting as the club account directly (no per-user OAuth needed):

1. In the app dashboard, scroll to **Keys and Tokens**.
2. Under **Authentication Tokens**, click **Generate** next to **Access Token and Secret**.
3. These tokens represent the account that owns the app — save them immediately (shown only once).

### Step 5 — Free Tier Limits

X's free Basic tier allows **1,500 tweets per month** with write access. This is sufficient for automated club announcements. If you need more, the **Basic paid tier** ($100/month) allows 3,000 tweets/month.

### Credentials to Store

| Key | Description |
|---|---|
| `X_API_KEY` | API Key (Consumer Key) |
| `X_API_KEY_SECRET` | API Key Secret (Consumer Secret) |
| `X_ACCESS_TOKEN` | Access Token for the club account |
| `X_ACCESS_TOKEN_SECRET` | Access Token Secret |
| `X_BEARER_TOKEN` | Bearer Token (for read-only requests) |

### Posting Example (v2 API)

```
POST https://api.twitter.com/2/tweets
Authorization: OAuth 1.0a (signed with all four keys above)
{ "text": "New health clearances posted! ..." }
```

### Useful Links

- [X Developer Portal](https://developer.x.com/en/portal/dashboard)
- [X API v2 docs](https://developer.x.com/en/docs/twitter-api)
- [POST /2/tweets reference](https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets)

---

## Storing Credentials Securely

All tokens should be stored as **environment variables** or in a secrets manager — never committed to the repository.

For local development, add to `.env` (already in `.gitignore`):

```env
META_APP_ID=...
META_APP_SECRET=...
META_PAGE_ACCESS_TOKEN=...
META_PAGE_ID=...
META_IG_ACCOUNT_ID=...

X_API_KEY=...
X_API_KEY_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
X_BEARER_TOKEN=...
```

For production, store these in your secrets manager (1Password, AWS Secrets Manager, etc.) and inject them as environment variables at runtime — consistent with how the rest of breed_club handles secrets.
