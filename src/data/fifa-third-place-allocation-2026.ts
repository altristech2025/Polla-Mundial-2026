/**
 * FIFA 2026 — Best-thirds allocation eligibility por slot R32.
 * Fuente: PDF "Guía del Mundial de Fútbol 2026" — sección Dieciseisavos.
 *
 * Para cada slot que recibe un tercero, esta tabla lista los GRUPOS elegibles
 * desde donde puede provenir ese tercero.
 *
 * La asignación final (qué grupo concreto va a qué slot) depende de cuáles 8
 * de los 12 grupos aportaron tercero. FIFA publica una tabla combinatoria
 * exhaustiva (495 combinaciones); aquí usamos un matching greedy con backtracking
 * que respeta la eligibility — ver `allocateBestThirds()` en lib/qualification.ts.
 *
 * Si FIFA libera la tabla oficial 2026, reemplazar este archivo por el lookup
 * exacto.
 */

export type Slot = {
  matchCode: string;
  firstPlaceGroup: string;      // grupo del 1° que enfrenta al tercero
  eligibleThirdGroups: string[]; // grupos cuyo 3° puede caer aquí
};

export const THIRD_PLACE_SLOTS: Slot[] = [
  { matchCode: "P74", firstPlaceGroup: "E", eligibleThirdGroups: ["A","B","C","D","F"] },
  { matchCode: "P77", firstPlaceGroup: "I", eligibleThirdGroups: ["C","D","F","G","H"] },
  { matchCode: "P79", firstPlaceGroup: "A", eligibleThirdGroups: ["C","E","F","H","I"] },
  { matchCode: "P80", firstPlaceGroup: "L", eligibleThirdGroups: ["E","H","I","J","K"] },
  { matchCode: "P81", firstPlaceGroup: "D", eligibleThirdGroups: ["B","E","F","I","J"] },
  { matchCode: "P82", firstPlaceGroup: "G", eligibleThirdGroups: ["A","E","H","I","J"] },
  { matchCode: "P85", firstPlaceGroup: "B", eligibleThirdGroups: ["E","F","G","I","J"] },
  { matchCode: "P87", firstPlaceGroup: "K", eligibleThirdGroups: ["D","E","I","J","L"] },
];
