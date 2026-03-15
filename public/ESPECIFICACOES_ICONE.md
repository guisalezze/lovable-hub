# Especificações do Ícone PWA para iOS

## Tamanho Recomendado

**1024x1024 pixels** (quadrado perfeito)

Este é o tamanho ideal porque:
- ✅ Funciona perfeitamente no iOS (iPhone e iPad)
- ✅ Alta qualidade em todos os dispositivos
- ✅ O sistema iOS escala automaticamente para outros tamanhos
- ✅ Funciona também no Android

## Alternativa (menor)

**512x512 pixels** (também funciona bem)

## Requisitos Obrigatórios

1. **Formato:** PNG
2. **Dimensões:** Quadrado perfeito (mesma largura e altura)
3. **Preenchimento:** Logo deve ocupar **100% do espaço** (sem padding, sem bordas)
4. **Fundo:** 
   - Transparente (recomendado)
   - Ou cor sólida de sua escolha

## Como Editar Sua Logo (1536x1024)

### Opção 1: Crop (Cortar)
- Pegue a parte central da sua logo
- Corte para 1024x1024 (ou 512x512)
- Mantenha a parte mais importante da logo no centro

### Opção 2: Esticar/Redimensionar
- Redimensione a logo para 1024x1024
- Pode distorcer um pouco, mas preenche 100%

### Opção 3: Adicionar Fundo
- Crie um canvas 1024x1024
- Coloque sua logo centralizada
- Preencha o espaço vazio com cor de fundo da logo

## Após Editar

1. Salve como `logo.png`
2. Substitua o arquivo em `public/logo.png`
3. Faça commit e deploy
4. Desinstale e reinstale o app no iOS

## Ferramentas Recomendadas

- **Online:** Canva, Photopea, Remove.bg
- **Desktop:** Photoshop, GIMP, Figma
- **Mobile:** PicsArt, Snapseed
