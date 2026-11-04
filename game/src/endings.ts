import type { EndingId } from "./save";

export interface EndingText {
  title: string;
  text: string;
}

/** Textos de los tres finales. Se muestran al salir y en la lista de finales. */
export const ENDING_TEXT: Record<EndingId, EndingText> = {
  bueno: {
    title: "Salida",
    text:
      "Cruzas la puerta principal. El aire frío te da en la cara.\n" +
      "Detrás, las luces del hospital se apagan una a una.\n" +
      "Sabes lo que pasó. Y sabes quién lo hizo.",
  },
  malo: {
    title: "Atrapado",
    text:
      "Cruzas la salida, pero el pasillo sigue ahí.\n" +
      "Vuelves a la camilla. Son las 03:17.\n" +
      "El reloj empieza otra vez.",
  },
  secreto: {
    title: "Paciente siete",
    text:
      "La firma de la ficha es tu nombre.\n" +
      "Eres el paciente siete. La criatura es lo que te hicieron.\n" +
      "Cruzas la puerta. Ella viene contigo.",
  },
};
