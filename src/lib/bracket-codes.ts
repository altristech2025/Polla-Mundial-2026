/**
 * Constantes únicas con los match codes del bracket FIFA 2026.
 * Importar desde aquí en cualquier consumidor para que el árbol sea una sola
 * fuente de verdad.
 */

export const R32_CODES = [
  "P73","P74","P75","P76","P77","P78","P79","P80",
  "P81","P82","P83","P84","P85","P86","P87","P88",
] as const;

export const R16_CODES = [
  "P89","P90","P91","P92","P93","P94","P95","P96",
] as const;

export const QF_CODES = ["P97","P98","P99","P100"] as const;
export const SF_CODES = ["P101","P102"] as const;
export const THIRD_CODE = "P103" as const;
export const FINAL_CODE = "P104" as const;

export const ALL_BRACKET_CODES = [
  ...R32_CODES, ...R16_CODES, ...QF_CODES, ...SF_CODES,
  THIRD_CODE, FINAL_CODE,
] as const;

// Layout visual estilo "dos caminos a la copa" — del bracket oficial FIFA 2026
export const LEFT_R32  = ["P74","P77","P73","P75","P83","P84","P81","P82"] as const;
export const RIGHT_R32 = ["P76","P78","P79","P80","P86","P88","P85","P87"] as const;
export const LEFT_R16  = ["P89","P90","P93","P94"] as const;
export const RIGHT_R16 = ["P91","P92","P95","P96"] as const;
export const LEFT_QF   = ["P97","P99"] as const;
export const RIGHT_QF  = ["P98","P100"] as const;
