/**
 * Typed errors for the AI provider adapter layer. `resolveCapability()`
 * (registry.js) and the AI Reply engine (Phase 4) both catch
 * CapabilityNotSupportedError specifically to trigger the multi-provider
 * fallback described in the plan — a provider adapter throws this instead
 * of a generic Error so the caller can tell "this provider genuinely can't
 * do that" apart from "the call failed".
 */

export class CapabilityNotSupportedError extends Error {
  constructor(providerId, capability) {
    super(`Provider "${providerId}" does not support capability "${capability}".`);
    this.name = "CapabilityNotSupportedError";
    this.providerId = providerId;
    this.capability = capability;
  }
}

/** A real call to the provider's API failed (network, auth, rate limit, etc.). */
export class ProviderCallError extends Error {
  constructor(providerId, message, { status = null, cause = null } = {}) {
    super(message);
    this.name = "ProviderCallError";
    this.providerId = providerId;
    this.status = status;
    this.cause = cause;
  }
}
