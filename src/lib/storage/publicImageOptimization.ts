import sharp from 'sharp'

type OptimizePublicImageOptions = {
  maxWidth: number
  quality: number
  minInputBytes: number
  forceWhenInputExceedsBytes?: number
}

type OptimizePublicImageResult = {
  buffer: Buffer
  mimeType: string
}

export async function optimizePublicImageBuffer(
  inputBuffer: Buffer,
  mimeType: string,
  options: OptimizePublicImageOptions,
): Promise<OptimizePublicImageResult> {
  if (mimeType === 'image/gif') {
    return { buffer: inputBuffer, mimeType }
  }

  const metadata = await sharp(inputBuffer).metadata()
  const width = metadata.width ?? 0
  const shouldTry =
    width > options.maxWidth ||
    inputBuffer.byteLength > options.minInputBytes ||
    Boolean(options.forceWhenInputExceedsBytes && inputBuffer.byteLength > options.forceWhenInputExceedsBytes)

  if (!shouldTry) {
    return { buffer: inputBuffer, mimeType }
  }

  let pipeline = sharp(inputBuffer)
    .rotate()
    .resize({ width: options.maxWidth, withoutEnlargement: true })

  if (mimeType === 'image/png') {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
  } else if (mimeType === 'image/webp') {
    pipeline = pipeline.webp({ quality: options.quality })
  } else {
    pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true })
    mimeType = 'image/jpeg'
  }

  const optimized = Buffer.from(await pipeline.toBuffer())
  const forceOptimized = Boolean(
    options.forceWhenInputExceedsBytes && inputBuffer.byteLength > options.forceWhenInputExceedsBytes,
  )

  if (!forceOptimized && optimized.byteLength >= inputBuffer.byteLength) {
    return { buffer: inputBuffer, mimeType }
  }

  return { buffer: optimized, mimeType }
}
