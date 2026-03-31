declare module "fontkit" {
  const fontkit: {
    openSync: (filePath: string) => {
      unitsPerEm: number
      layout: (text: string) => {
        glyphs?: Array<{ advanceWidth?: number }>
        positions?: Array<{ xAdvance?: number }>
      }
    }
  }

  export default fontkit
}
