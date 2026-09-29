import type { Messages } from "../types"

export const edition: Messages["edition"] = {
  localNotice: {
    title: "You're using the local edition",
    description: "Data stays in this browser; deploy the cloud edition to sync across devices",
    body1:
      "Data lives only in this browser and never syncs to the cloud. Clearing browser data wipes it too, so export a backup from the avatar menu every now and then.",
    body2: "To sync between phone and computer, deploy the cloud edition to your own Cloudflare for free, then import your backup.",
    deploy: "Deploy cloud edition",
    dismiss: "Got it",
  },
  repo: {
    label: "GitHub repository",
  },
}
