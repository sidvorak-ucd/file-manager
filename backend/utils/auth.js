const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
// Use axios for HTTP requests
const axios = require("axios");

// Cache for JWKS to avoid fetching on every request
let jwksCache = null;
let jwksUrl = null;

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const AWS_REGION = process.env.AWS_REGION; // Need region for the URL

/**
 * Fetches the JWKS from Cognito User Pool endpoint.
 */
const fetchJwks = async () => {
  if (!COGNITO_USER_POOL_ID || !AWS_REGION) {
    throw new Error(
      "Cognito User Pool ID or AWS Region environment variables not set."
    );
  }
  jwksUrl = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
  console.log(`[Auth] Fetching JWKS from: ${jwksUrl}`);

  try {
    // Use axios.get()
    const response = await axios.get(jwksUrl);
    // Axios throws an error for non-2xx responses by default
    // Access data via response.data
    jwksCache = response.data;
    if (!jwksCache || !jwksCache.keys) {
      throw new Error("Fetched JWKS data is invalid or missing keys.");
    }
    console.log("[Auth] JWKS fetched and cached successfully.");
    return jwksCache;
  } catch (error) {
    console.error("[Auth] Error fetching JWKS:", error.message);
    if (axios.isAxiosError(error) && error.response) {
      console.error("[Auth] Axios response status:", error.response.status);
      console.error("[Auth] Axios response data:", error.response.data);
    }
    jwksCache = null; // Clear cache on error
    throw error; // Re-throw the original error
  }
};

/**
 * Verifies the JWT token against Cognito JWKS and returns the 'sub' claim.
 * @param {string} token - The JWT token string.
 * @returns {Promise<string>} - The user's sub (subject) identifier.
 * @throws {Error} - If the token is invalid, expired, or verification fails.
 */
const verifyTokenAndGetSub = async (token) => {
  if (!token) {
    throw new Error("Token is required.");
  }

  // Fetch JWKS if not cached
  const jwks = jwksCache || (await fetchJwks());
  if (!jwks || !jwks.keys) {
    throw new Error("Could not fetch or parse JWKS.");
  }

  // Decode the token to get the header (including kid)
  const decodedToken = jwt.decode(token, { complete: true });
  if (!decodedToken) {
    throw new Error("Invalid token format.");
  }

  // Find the appropriate key from JWKS using the token's kid
  const key = jwks.keys.find((k) => k.kid === decodedToken.header.kid);
  if (!key) {
    console.error(
      `[Auth] Public key not found in JWKS for kid: ${decodedToken.header.kid}. Refetching JWKS.`
    );
    // Key might have rotated, try refetching JWKS once
    const freshJwks = await fetchJwks();
    const freshKey = freshJwks.keys.find(
      (k) => k.kid === decodedToken.header.kid
    );
    if (!freshKey) {
      throw new Error("Public key not found in JWKS even after refresh.");
    }
    // Convert the found JWK to PEM format
    const pem = jwkToPem(freshKey);
    // Verify the token
    try {
      const payload = jwt.verify(token, pem, { algorithms: ["RS256"] });
      // Basic validation (issuer is already checked by Cognito)
      // You might add audience (aud) check if necessary
      // console.log("[Auth] Token verified successfully:", payload);
      if (!payload.sub) {
        throw new Error("Token payload missing sub claim.");
      }
      return payload.sub;
    } catch (error) {
      console.error("[Auth] Token verification failed:", error.message);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  // Original key found path
  const pem = jwkToPem(key);
  try {
    const payload = jwt.verify(token, pem, { algorithms: ["RS256"] });
    if (!payload.sub) {
      throw new Error("Token payload missing sub claim.");
    }
    return payload.sub;
  } catch (error) {
    console.error("[Auth] Token verification failed:", error.message);
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

module.exports = {
  verifyTokenAndGetSub,
};
