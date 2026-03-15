// Script para remover áreas brancas e garantir preenchimento 100%
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.join(__dirname, '../public/logo.png');
const outputPath = path.join(__dirname, '../public/logo-no-white.png');

async function removeWhiteAreas() {
  try {
    if (!fs.existsSync(logoPath)) {
      console.error(`❌ Logo não encontrada em: ${logoPath}`);
      process.exit(1);
    }

    const metadata = await sharp(logoPath).metadata();
    console.log(`📐 Logo original: ${metadata.width}x${metadata.height}`);

    // Processar imagem para remover áreas brancas e garantir preenchimento
    await sharp(logoPath)
      .resize(1024, 1024, {
        fit: 'fill', // Força preenchimento completo
        kernel: sharp.kernel.lanczos3
      })
      // Remover áreas muito brancas (threshold ajustável)
      .threshold(240, { grayscale: false }) // Considera branco apenas valores acima de 240
      .toFile(outputPath);

    console.log(`✅ Logo processada: ${outputPath}`);
    console.log(`\n📝 Próximos passos:`);
    console.log(`   1. Verifique logo-no-white.png`);
    console.log(`   2. Se estiver bom, substitua: cp public/logo-no-white.png public/logo.png`);
    console.log(`   3. Faça commit e deploy`);

  } catch (error) {
    console.error('❌ Erro ao processar:', error.message);
    process.exit(1);
  }
}

removeWhiteAreas();
