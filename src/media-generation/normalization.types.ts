export type MediaGenerationNormalizationMetadataInput = Record<string, unknown>;

export type MediaNormalizationValue = string | number | boolean;

export type MediaNormalizationEntry<
  TValue extends MediaNormalizationValue = MediaNormalizationValue,
> = {
  requested?: TValue;
  applied?: TValue;
  derivedFrom?: string;
  supportedValues?: readonly TValue[];
};
