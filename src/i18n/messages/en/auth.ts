import type { Messages } from "../types"

export const auth: Messages["auth"] = {
  gate: {
    offline: "Can't reach the server",
  },
  login: {
    passwordLabel: "Access passcode",
    empty: "Enter your access passcode",
    wrongPassword: "Wrong passcode",
    rateLimited: (minutes) => `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
    network: "Can't reach the server",
    failed: "Sign-in failed, try again",
    submitting: "Signing in…",
    submit: "Sign in",
    noPassword: "This site has no access passcode set up yet",
  },
  tokens: {
    title: "Access tokens",
    description: "Login credentials for programs like AI assistants",
    loadFailed: "Couldn't load tokens",
    empty: "No tokens yet",
    createdAt: (day) => `Created ${day}`,
    lastUsed: (day) => `Used ${day}`,
    neverUsed: "Never used",
    revoke: "Revoke",
    revokeTitle: (name) => `Revoke "${name}"?`,
    revokeDescription: "Anything using this token stops working immediately.",
    created: {
      label: "New access token",
      copy: "Copy",
      copied: "Copied",
      hint: "Shown only once — copy and save it now",
    },
    form: {
      placeholder: "Purpose, e.g. Claude",
      label: "Token purpose",
      required: "Enter a purpose",
      tooLong: (max) => `Up to ${max} characters`,
      createFailed: "Couldn't create it, try again",
      revokeFailed: "Couldn't revoke it, try again",
    },
  },
  api: {
    unauthorized: "Sign in again",
    network: "Can't reach the server",
    rateLimited: "Too many attempts",
    serverError: (status) => `Server error (${status})`,
  },
}
