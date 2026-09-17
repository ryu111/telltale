// Panel registry. SDD §2.2. Order is draw order.

import type { Panel } from "../panel";
import { agents } from "./agents";
import { clock } from "./clock";
import { hello } from "./hello";

export const PANELS: readonly Panel[] = [agents, hello, clock];
