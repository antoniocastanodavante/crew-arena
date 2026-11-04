export type ItemKind = "llave" | "pila" | "documento" | "especial" | "pista";

export interface ItemDef {
  name: string;
  kind: ItemKind;
  description: string;
  /** Si se puede usar desde el inventario. */
  usable: boolean;
}

/** Orden de las secciones en el inventario. */
export const KIND_ORDER: ItemKind[] = ["llave", "pila", "documento", "especial", "pista"];

export const KIND_LABELS: Record<ItemKind, string> = {
  llave: "Llaves",
  pila: "Pilas",
  documento: "Documentos",
  especial: "Objetos especiales",
  pista: "Pistas",
};

/** Catálogo de objetos. La clave es el id que se guarda en el inventario. */
export const ITEMS: Record<string, ItemDef> = {
  llave_oxidada: {
    name: "Llave oxidada",
    kind: "llave",
    description: "Una llave pequeña y oxidada. No tiene etiqueta.",
    usable: false,
  },
  pila: {
    name: "Pila",
    kind: "pila",
    description: "Pila de linterna. Al usarla, recarga 40 % de batería.",
    usable: true,
  },
  doc_admision: {
    name: "Ficha de admisión",
    kind: "documento",
    description:
      "Nombre del paciente borrado. Entrada: 23:40. Destino: sótano. Firma ilegible.",
    usable: false,
  },
  doc_guardia: {
    name: "Nota de guardia",
    kind: "documento",
    description:
      "Nadie baja al sótano después de medianoche. Los ruidos de las habitaciones cerradas no son de los pacientes.",
    usable: false,
  },
  tarjeta_seguridad: {
    name: "Tarjeta de seguridad",
    kind: "especial",
    description: "Tarjeta de acceso del personal. La banda magnética está rayada.",
    usable: false,
  },
  pista_papel: {
    name: "Papel doblado",
    kind: "pista",
    description: "Escrito a mano: «No mires la hora. Ella siempre mira la hora».",
    usable: false,
  },
};
