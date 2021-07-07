import type { Source } from "@graphql-tools/utils";
import crypto from "crypto";
import { OperationDefinitionNode, FragmentDefinitionNode } from "graphql";

export type OperationOrFragment = {
  initialName: string;
  definition: OperationDefinitionNode | FragmentDefinitionNode;
};

export type SourceWithOperations = {
  source: Source;
  operations: Array<OperationOrFragment>;
};

const expandSources = (sources: Array<Source>): Array<Source> => {
  const expandedSources: Array<Source> = [];
  for (const source of sources) {
    const document = source.document!;
    const rawSDL = source.rawSDL!;
    const operationSDL = rawSDL.split(`\n#-#\n`);
    operationSDL.forEach((rawSDL, index) => {
      expandedSources.push({
        document: {
          kind: "Document",
          definitions: [document.definitions[index]],
        },
        rawSDL,
        location: source.location,
      });
    });
  }
  return expandedSources;
};

export function processSources(sources: Array<Source>) {
  const fullHashes = new Map<string, Source>();
  const filteredSources: Array<Source> = [];
  sources = expandSources(sources);

  for (const source of sources) {
    if (!source) continue;

    const hash = crypto
      .createHash(`sha256`)
      .update(source.rawSDL!)
      .digest(`hex`);
    if (fullHashes.has(hash)) continue;

    fullHashes.set(hash, source);
    filteredSources.push(source);
  }

  let hashLength = 0;

  findHashSize: for (let t = 1; t <= 32; ++t) {
    const seen = new Set<string>();
    for (const hash of fullHashes.keys()) {
      const sub = hash.substr(0, t);
      if (seen.has(sub)) {
        continue findHashSize;
      } else {
        seen.add(sub);
      }
    }

    hashLength = t;
    break;
  }

  const subHashes = new Map<string, Source>();
  for (const [hash, record] of fullHashes)
    subHashes.set(hash.substr(0, hashLength), record);

  const sourcesWithOperations: Array<SourceWithOperations> = [];

  for (const [hash, source] of subHashes) {
    const { document } = source;
    const operations: Array<OperationOrFragment> = [];

    for (const definition of document?.definitions ?? []) {
      if (
        definition?.kind !== `OperationDefinition` &&
        definition?.kind !== "FragmentDefinition"
      )
        continue;

      if (definition.name?.kind !== `Name`) continue;

      operations.push({
        initialName:
          definition.kind === "FragmentDefinition"
            ? `${definition.name.value}FragmentDoc`
            : `${definition.name.value}Document`,
        definition,
      });
    }

    if (operations.length === 0) continue;

    sourcesWithOperations.push({
      source,
      operations,
    });
  }

  return sourcesWithOperations;
}
