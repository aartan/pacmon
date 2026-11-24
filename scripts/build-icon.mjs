// Renders build/icon.svg to build/icon.png (1024x1024) for electron-builder.
import sharp from 'sharp'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await sharp(resolve(root, 'build/icon.svg'))
  .resize(1024, 1024)
  .png()
  .toFile(resolve(root, 'build/icon.png'))

console.log('Wrote build/icon.png')
