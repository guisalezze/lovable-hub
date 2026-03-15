// Script para gerar ícone quadrado a partir da logo retangular
// Requer: npm install sharp

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.join(__dirname, '../public/logo.png');
const outputPath = path.join(__dirname, '../public/logo-square.png');

async function generateSquareIcon() {
  try {
    // Verificar se logo existe
    if (!fs.existsSync(logoPath)) {
      console.error(`❌ Logo não encontrada em: ${logoPath}`);
      process.exit(1);
    }

    // Obter metadados da imagem
    const metadata = await sharp(logoPath).metadata();
    console.log(`📐 Logo original: ${metadata.width}x${metadata.height}`);

    // Criar tamanho quadrado (usar a maior dimensão)
    const size = Math.max(metadata.width, metadata.height);
    console.log(`🔲 Criando ícone quadrado: ${size}x${size}`);

    // Calcular offsets para centralizar
    const xOffset = Math.floor((size - metadata.width) / 2);
    const yOffset = Math.floor((size - metadata.height) / 2);

    // Criar imagem quadrada preenchendo 100% do espaço SEM áreas brancas
    // Forçar resize para preencher completamente, esticando se necessário
    const image = sharp(logoPath);
    const { width, height } = await image.metadata();
    
    // Se a imagem já é quadrada, apenas garantir que está no tamanho certo
    if (width === height && width === size) {
      // Já está no tamanho certo, apenas copiar
      await image.toFile(outputPath);
    } else {
      // Redimensionar forçando preenchimento completo (pode esticar)
      await image
        .resize(size, size, {
          fit: 'fill', // Força preenchimento completo, esticando se necessário
          kernel: sharp.kernel.lanczos3 // Melhor qualidade ao redimensionar
        })
        .toFile(outputPath);
    }

    console.log(`✅ Ícone quadrado criado: ${outputPath}`);
    console.log(`\n📝 Próximos passos:`);
    console.log(`   1. Verifique o arquivo logo-square.png`);
    console.log(`   2. Se estiver bom, substitua logo.png por logo-square.png`);
    console.log(`   3. Ou renomeie: mv public/logo-square.png public/logo.png`);
    console.log(`   4. Faça commit e deploy`);
    console.log(`   5. Desinstale e reinstale o app no iOS`);

  } catch (error) {
    console.error('❌ Erro ao processar imagem:', error.message);
    process.exit(1);
  }
}

generateSquareIcon();
