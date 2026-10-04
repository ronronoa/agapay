export const ACCESS_TOKEN_TTL_SECONDS = 900;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const ACCESS_TOKEN_ISSUER = 'agapay-api';
export const ACCESS_TOKEN_AUDIENCE = 'agapay-web';
export const REFRESH_COOKIE_NAME = 'agapay_refresh';

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'agapay';

export const ARGON2_MEMORY_COST = 19_456;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;
