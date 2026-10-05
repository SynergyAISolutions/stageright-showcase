# StageRight

AI virtual staging for real estate. Upload an image of a room, pick a decor style, and get staged images you can list with.

**Live app:** https://stageright.aiwave.com.au

> This is a read-only snapshot of the StageRight codebase as of 5 October 2026, shared for review. The live app is built and deployed from a separate private repository, so changes here never reach it.

## What it does

- **A folder per property.** Every staging belongs to a listing, so an agent's work stays organised by address.
- **Twelve styles**, from Coastal and Hamptons to Japandi and Contemporary Australian.
- **Two ways to stage each style**, both starting from a room analysis by Claude Opus:
  - **Three Takes** (the default, 2 credits per style): three versions, one each from Gemini Nano Banana Pro, GPT Image 2 at medium quality and GPT Image 2 at high quality. All three share the same analysis.
  - **Single Take** (1 credit per style): one version from GPT Image 2 at medium quality.
- **Credits, not subscriptions.** 30 free credits on signup, then one-off credit packs through Stripe Checkout (AUD).
- **Honest labelling.** A "Virtually Staged · AI" watermark is burned into every customer image.

## How it is built

| Layer | Tech |
| --- | --- |
| App | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Hosting | AWS Amplify, Sydney region |
| Auth, data, files | AWS Cognito, DynamoDB, S3 |
| Staging worker | AWS Lambda (Node), with Sharp for the watermark |
| Models | Claude Opus (room analysis), Gemini Nano Banana Pro and GPT Image 2 (staging) |
| Payments | Stripe Checkout, webhook credit accounting, Customer Portal |

## Where to look

- `src/app/` pages and API routes (the staging wizard is `src/app/stage/page.tsx`)
- `lambda/staging-worker/` the worker that analyses the room, calls the image models and applies the watermark
- `src/lib/ai/prompts.ts` the twelve styles
- `docs/superpowers/` the design specs and implementation plans written along the way
- `CLAUDE.md` the project brief the AI coding agents work from

## Running it

This snapshot is shared for reading, not as a ready-to-run kit. Running your own copy would mean setting up the AWS side by hand (Cognito, DynamoDB, S3, the Lambda worker and the permissions between them), bringing your own Gemini, OpenAI, Anthropic and Stripe accounts, and changing the few places that point at the live StageRight domain and admin accounts.

`.env.example` lists the main settings but not all of them. The code reads others too, such as the Stripe price IDs in `src/env.ts`.

## Built by

Tara Ferguson, [AI WAVE](https://aiwave.com.au). Designed and built solo, with AI coding agents as a working partner.
