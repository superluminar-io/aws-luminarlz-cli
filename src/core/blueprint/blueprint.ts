import { BlueprintRenderer, blueprintExists } from './blueprint-renderer';
import { BlueprintReport } from './blueprint-report';
import { InitImplementation, RenderBlueprintOptions } from './implementations/init-implementation';
import {
  BlueprintFileDiff,
  ExistingFileDecision,
  UpdateImplementation,
  UpdateBlueprintOptions,
} from './implementations/update-implementation';

export { blueprintExists };
export type { BlueprintRenderResult } from './blueprint-renderer';
export type { RenderBlueprintOptions };
export type {
  BlueprintFileDiff,
  ExistingFileDecision,
  UpdateBlueprintOptions,
};

const renderer = new BlueprintRenderer();
const initImplementation = new InitImplementation(renderer);
const updateImplementation = new UpdateImplementation(renderer);

export const initializeBlueprintFiles = async (options: RenderBlueprintOptions) => {
  return initImplementation.apply(options);
};

export const synchronizeBlueprintFiles = async (options: UpdateBlueprintOptions): Promise<BlueprintReport> => {
  return updateImplementation.apply(options);
};
