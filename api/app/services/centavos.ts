export function emCentavos(valor: string) {
  return Math.round(Number(valor) * 100)
}

export function emReais(centavos: number) {
  return (centavos / 100).toFixed(2)
}
