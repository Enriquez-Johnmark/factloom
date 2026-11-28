import { healthcareDomain } from '@kronomind/adapters';
import type { Domain } from '@kronomind/core';
import { softwareDevelopmentDomain } from '@kronomind/graph-rag';

/** The domains the server can run under, chosen by name with `KRONOMIND_DOMAIN`. The first is the default. */
export const KNOWN_DOMAINS: readonly [Domain, ...Domain[]] = [softwareDevelopmentDomain, healthcareDomain];
