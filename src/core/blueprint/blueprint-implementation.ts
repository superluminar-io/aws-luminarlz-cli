export interface BlueprintImplementation<TOptions, TResult> {
  apply(options: TOptions): Promise<TResult>;
}
