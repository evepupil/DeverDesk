import type { ChangesTool } from "../../types"
import { manageChangesTool } from "./manage-changes"

export const changesTools: ChangesTool<unknown>[] = [manageChangesTool]
