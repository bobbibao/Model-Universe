export const GRADES = ['HG', 'RG', 'MG', 'PG', 'SD', 'EG', 'RE/100', 'MGSD', 'OTHER'] as const;
export type GunplaGrade = typeof GRADES[number];
export const CONDITIONS = ['new', 'preowned'] as const;
export type ModelCondition = typeof CONDITIONS[number];
export const ASSEMBLY_STATES = ['unassembled', 'partially_assembled', 'assembled', 'painted'] as const;
export type AssemblyState = typeof ASSEMBLY_STATES[number];
export interface GunplaAttributes {
  grade?: GunplaGrade | null;
  scale?: string | null;
  series?: string | null;
  modelCode?: string | null;
  condition?: ModelCondition;
  assemblyState?: AssemblyState;
  boxCondition?: string | null;
  includedAccessories?: string[];
  defects?: string[];
  descriptionEn?: string | null;
  descriptionVi?: string | null;
}
