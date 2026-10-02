import type { Messages } from "../types"

export const oauth: Messages["oauth"] = {
  title: (name) => `${name} wants to connect to your DeverDesk`,
  returnTo: "Returns to",
  returnToLocal: "Hands off to an app on this computer at",
  permission: "Permission",
  allow: "Allow",
  allowing: "Allowing…",
  deny: "Deny",
  redirecting: (host) => `Returning to ${host}…`,
  requestError: (host) => `The authorization request from ${host} is invalid`,
  backTo: (host) => `Return to ${host}`,
  invalid: (reason) => `This authorization link is invalid: ${reason}`,
  reasons: {
    client_id: "the client ID is malformed",
    unknown_client: "this client isn't registered",
    metadata_unavailable: "couldn't read the client's metadata",
    redirect_uri: "the return address doesn't match its registration",
  },
  failed: "Couldn't complete the authorization, try again",
  localEdition: "The local edition can't connect to AI apps",
}
