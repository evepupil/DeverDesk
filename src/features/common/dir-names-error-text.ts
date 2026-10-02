import { DIR_NAME_MAX_LENGTH, DIR_NAMES_MAX } from "@/domain/dir-names"
import type { DirNamesError } from "@/domain/dir-names"
import { getT } from "@/i18n/runtime"

export function dirNamesErrorText(error: DirNamesError): string {
  const messages = getT().projects.directoryNames.errors
  switch (error.kind) {
    case "empty":
      return messages.empty
    case "too-long":
      return messages.tooLong(DIR_NAME_MAX_LENGTH)
    case "bad-char":
      return messages.badChar
    case "too-many":
      return messages.tooMany(DIR_NAMES_MAX)
    case "repeated":
      return messages.repeated
    case "taken":
      return messages.taken(error.projectName)
  }
}
