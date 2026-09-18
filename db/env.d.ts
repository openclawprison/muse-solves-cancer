declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    MUSE_TREASURY_ADDRESS?: string;
    MUSE_REWARD_TOKEN_ACCOUNT?: string;
    MUSE_REWARD_MINT?: string;
    MUSE_REWARD_DECIMALS?: string;
    MUSE_KEEPER_ADDRESS?: string;
    MUSE_OPERATOR_ADDRESS?: string;
    MUSE_OPERATOR_API_KEY?: string;
    MUSE_REWARD_PROGRAM_ID?: string;
    MUSE_CHAIN_RPC_URL?: string;
    MUSE_TOKEN_ADDRESS?: string;
  }
}
